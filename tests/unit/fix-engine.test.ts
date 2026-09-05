import { describe, expect, it } from 'vitest';
import { createInMemorySource } from '@/lib/project-source';
import { describePlan, hasFixer, planFixes, unifiedDiff } from '@/lib/fix-engine';
import type { LocalAuditFinding } from '@/lib/local-project-analyzer';

function finding(id: string, overrides: Partial<LocalAuditFinding> = {}): LocalAuditFinding {
  return {
    id,
    category: 'Docker',
    title: id,
    description: '',
    impact: 'Medium',
    recommendation: '',
    evidence: '',
    source: 'Dockerfile',
    ...overrides,
  };
}

const NODE_DOCKERFILE = [
  'FROM node:20-alpine',
  'WORKDIR /app',
  'COPY package*.json ./',
  'RUN npm install --omit=dev',
  'COPY . .',
  'CMD ["node", "server.js"]',
].join('\n');

describe('unifiedDiff', () => {
  it('renders a hunk with surrounding context', () => {
    const diff = unifiedDiff('f.txt', 'a\nb\nc\nd\ne\n', 'a\nb\nCHANGED\nd\ne\n');

    expect(diff).toContain('--- a/f.txt');
    expect(diff).toContain('+++ b/f.txt');
    expect(diff).toContain('-c');
    expect(diff).toContain('+CHANGED');
    expect(diff).toContain(' b');
  });

  it('marks a created file as coming from /dev/null', () => {
    expect(unifiedDiff('new.txt', null, 'hello\n')).toContain('--- /dev/null');
  });

  it('returns nothing when the content is unchanged', () => {
    expect(unifiedDiff('f.txt', 'same\n', 'same\n')).toBe('');
  });

  it('keeps two distant edits in separate hunks', () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 2', 'EDIT A').replace('line 35', 'EDIT B');
    const diff = unifiedDiff('f.txt', before, after);

    const hunkHeaders = diff.split('\n').filter((line) => line.startsWith('@@'));
    expect(hunkHeaders).toHaveLength(2);
  });
});

describe('Dockerfile fixes', () => {
  it('adds USER before the final CMD on an official node image', async () => {
    const source = createInMemorySource({ Dockerfile: NODE_DOCKERFILE });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.applied).toHaveLength(1);
    expect(plan.files).toHaveLength(1);

    const lines = plan.files[0].patched.split('\n');
    expect(lines.indexOf('USER node')).toBeGreaterThan(-1);
    expect(lines.indexOf('USER node')).toBeLessThan(
      lines.findIndex((line) => line.startsWith('CMD')),
    );
  });

  it('refuses USER when the base image is not an official node image', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM debian:12\nCMD ["./app"]\n',
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('may not exist');
  });

  it('judges the final stage, not the builder, in a multi-stage build', async () => {
    // Compiles on node and serves from nginx: the container that runs is nginx,
    // which has no node user. Reading any FROM would conclude the opposite.
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20-alpine AS builder',
        'RUN npm run build',
        '',
        'FROM nginx:alpine',
        'COPY --from=builder /app/dist /usr/share/nginx/html',
        'CMD ["nginx", "-g", "daemon off;"]',
      ].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('nginx:alpine');
    expect(plan.refused[0].reason).toContain('not an official');
  });

  it('follows a stage alias back to the image it was built from', async () => {
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20-alpine AS base',
        'WORKDIR /app',
        '',
        'FROM base',
        'CMD ["node", "server.js"]',
      ].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.applied).toHaveLength(1);
    expect(plan.files[0].patched).toContain('USER node');
  });

  it('refuses when the container starts through an entrypoint script', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM node:20\nENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]\n',
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('hands the container to a shell');
  });

  it('sees an entrypoint script even when CMD comes after it', async () => {
    // The shape Snouzy/workout-cool ships: setup.sh runs first and CMD is the
    // argument to it, so looking only at the last instruction misses the script.
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20-alpine AS runner',
        'RUN chmod +x /app/scripts/setup.sh',
        'ENTRYPOINT ["/app/scripts/setup.sh"]',
        'CMD ["pnpm", "start"]',
      ].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('setup.sh');
  });

  it('refuses a hardened node image from another registry', async () => {
    // growthbook/growthbook builds on dhi.io/node — a Docker Hardened Image,
    // which already runs unprivileged and provides `nonroot`, not `node`.
    const source = createInMemorySource({
      Dockerfile: ['FROM dhi.io/node:22-alpine', 'CMD ["node", "server.js"]'].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('dhi.io/node');
  });

  it('does not mistake an image merely ending in node for the official one', async () => {
    const source = createInMemorySource({
      Dockerfile: ['FROM mynode:20', 'CMD ["node", "server.js"]'].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
  });

  it('accepts the fully qualified spellings of the official image', async () => {
    for (const image of ['docker.io/node:20', 'library/node:20-alpine']) {
      const source = createInMemorySource({
        Dockerfile: [`FROM ${image}`, 'CMD ["node", "server.js"]'].join('\n'),
      });
      const plan = await planFixes([finding('docker-root-user')], source);
      expect(plan.applied).toHaveLength(1);
    }
  });

  it('refuses a CMD that hands the container to a shell inline', async () => {
    // msgbyte/tianji ships `CMD ["sh", "-c", "… prisma migrate deploy … "]`,
    // a startup script written inline rather than in a file.
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:22-alpine',
        'CMD ["sh", "-c", "prisma migrate deploy && node ./dist/main.js"]',
      ].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('hands the container to a shell');
  });

  it('refuses a CMD that is itself a startup script', async () => {
    // The shape brocoders/nestjs-boilerplate ships. There is no ENTRYPOINT, so
    // a guard that only looked at ENTRYPOINT would let this through.
    const source = createInMemorySource({
      Dockerfile: ['FROM node:20-alpine', 'CMD ["/opt/startup.relational.dev.sh"]'].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('startup.relational.dev.sh');
  });

  it('ignores an entrypoint script that belongs to an earlier stage', async () => {
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20 AS builder',
        'ENTRYPOINT ["/build.sh"]',
        '',
        'FROM node:20-alpine',
        'COPY --chown=node:node --from=builder /app /app',
        'CMD ["node", "server.js"]',
      ].join('\n'),
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.applied).toHaveLength(1);
    // --chown is present, so the ownership caveat is not raised.
    expect(plan.applied[0].rationale).not.toContain('owned by root');
  });

  it('warns about file ownership when no COPY sets --chown', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM node:20-alpine\nCOPY . .\nCMD ["node", "server.js"]\n',
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.applied[0].rationale).toContain('owned by root');
  });

  it('still patches an ENTRYPOINT that runs the binary directly', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM node:20\nENTRYPOINT ["node", "server.js"]\n',
    });
    const plan = await planFixes([finding('docker-root-user')], source);

    expect(plan.applied).toHaveLength(1);
    expect(plan.files[0].patched).toContain('USER node');
  });

  it('rewrites npm install to npm ci when a lockfile is committed', async () => {
    const source = createInMemorySource({
      Dockerfile: NODE_DOCKERFILE,
      'package-lock.json': '{"lockfileVersion":3}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files[0].patched).toContain('RUN npm ci --omit=dev');
    expect(plan.files[0].patched).not.toContain('npm install');
  });

  it('refuses npm ci when no lockfile is committed, because the build would break', async () => {
    const source = createInMemorySource({ Dockerfile: NODE_DOCKERFILE });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('npm ci fails without one');
  });

  it('never rewrites a global install of a named package', async () => {
    // The shape DaKheera47/job-ops ships. `npm ci -g @scope/cli` is not a
    // command: ci takes no package argument and has no global mode.
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20',
        'RUN npm install -g @openai/codex@1.2.3',
        'RUN npm install -g @anthropic-ai/claude-code@2.0.0',
        'CMD ["node", "x.js"]',
      ].join('\n'),
      'package-lock.json': '{}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('names a package or installs globally');
  });

  it('rewrites the project install and leaves the global ones intact', async () => {
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20',
        'RUN npm install -g pnpm',
        'COPY package*.json ./',
        'RUN npm install --omit=dev',
        'CMD ["node", "x.js"]',
      ].join('\n'),
      'package-lock.json': '{}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files[0].patched).toContain('RUN npm install -g pnpm');
    expect(plan.files[0].patched).toContain('RUN npm ci --omit=dev');
    expect(plan.applied[0].rationale).toContain('Global installs');
  });

  it('does not rewrite an install that names a package', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM node:20\nRUN npm install lodash\nCMD ["node", "x.js"]\n',
      'package-lock.json': '{}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files).toHaveLength(0);
  });

  it('refuses when the stage copies package.json without the lockfile', async () => {
    // The shape cefjoeii/mern-crud ships. The lockfile is committed, but it
    // never reaches the image, and npm ci reads it from inside the container.
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20',
        'WORKDIR /usr/src/app',
        'COPY package.json /usr/src/app/',
        'RUN npm install',
        'CMD ["node", "x.js"]',
      ].join('\n'),
      'package-lock.json': '{}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('reads the lockfile from inside the image');
  });

  it('accepts the glob that brings the lockfile along', async () => {
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20',
        'COPY package*.json ./',
        'RUN npm install --omit=dev',
        'CMD ["node", "x.js"]',
      ].join('\n'),
      'package-lock.json': '{}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files[0].patched).toContain('npm ci --omit=dev');
  });

  it('accepts a stage that copies the whole build context', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM node:20\nCOPY . .\nRUN npm install\nCMD ["node", "x.js"]\n',
      'package-lock.json': '{}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files[0].patched).toContain('RUN npm ci');
  });

  it('does not credit a lockfile copied in a different stage', async () => {
    const source = createInMemorySource({
      Dockerfile: [
        'FROM node:20 AS deps',
        'COPY package-lock.json ./',
        '',
        'FROM node:20',
        'COPY package.json ./',
        'RUN npm install',
        'CMD ["node", "x.js"]',
      ].join('\n'),
      'package-lock.json': '{}',
    });
    const plan = await planFixes([finding('docker-npm-install')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('reads the lockfile from inside the image');
  });

  it('composes two fixes to the same file into one patch', async () => {
    const source = createInMemorySource({
      Dockerfile: NODE_DOCKERFILE,
      'package-lock.json': '{}',
    });
    const plan = await planFixes(
      [finding('docker-root-user'), finding('docker-npm-install')],
      source,
    );

    expect(plan.applied).toHaveLength(2);
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0].findingIds).toEqual(['docker-root-user', 'docker-npm-install']);
    expect(plan.files[0].patched).toContain('USER node');
    expect(plan.files[0].patched).toContain('npm ci');
  });

  it('pins the base image to the major version declared in engines.node', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM node\nCMD ["node", "x.js"]\n',
      'package.json': '{"engines":{"node":">=20.0.0"}}',
    });
    const plan = await planFixes([finding('docker-unpinned-base')], source);

    expect(plan.files[0].patched).toContain('FROM node:20');
  });

  it('refuses to pin when the repository declares no node version to copy', async () => {
    const source = createInMemorySource({
      Dockerfile: 'FROM node:latest\nCMD ["node", "x.js"]\n',
      'package.json': '{"name":"x"}',
    });
    const plan = await planFixes([finding('docker-unpinned-base')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('would be a guess');
  });
});

describe('.dockerignore', () => {
  it("builds the file from the repository's own .gitignore", async () => {
    const source = createInMemorySource({
      Dockerfile: NODE_DOCKERFILE,
      '.gitignore': '# comment\nnode_modules\n.next\ncoverage\n\n!keep.me\n',
    });
    const plan = await planFixes([finding('docker-copy-all')], source);

    const content = plan.files[0].patched;
    expect(plan.files[0].filePath).toBe('.dockerignore');
    expect(plan.files[0].original).toBeNull();
    expect(content).toContain('.next');
    expect(content).toContain('coverage');
    expect(content).toContain('.git');
    expect(content).not.toContain('# comment');
    expect(content).not.toContain('!keep.me');
    // node_modules appears once, not twice, despite being in both lists.
    expect(content.split('\n').filter((line) => line === 'node_modules')).toHaveLength(1);
  });

  it('leaves an existing .dockerignore alone', async () => {
    const source = createInMemorySource({
      Dockerfile: NODE_DOCKERFILE,
      '.dockerignore': 'node_modules\n',
    });
    const plan = await planFixes([finding('docker-copy-all')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('already exists');
  });
});

describe('tsconfig', () => {
  it('flips strict false to true without touching comments', async () => {
    const tsconfig = [
      '{',
      '  // paths use "@/*" which once broke the parser',
      '  "compilerOptions": {',
      '    "strict": false,',
      '    "paths": { "@/*": ["./*"] }',
      '  }',
      '}',
    ].join('\n');

    const source = createInMemorySource({ 'tsconfig.json': tsconfig });
    const plan = await planFixes([finding('ts-strict-off', { source: 'tsconfig.json' })], source);

    expect(plan.files[0].patched).toContain('"strict": true');
    expect(plan.files[0].patched).toContain('// paths use "@/*"');
    expect(plan.files[0].patched).toContain('"paths": { "@/*": ["./*"] }');
  });

  it('inserts strict when the key is absent', async () => {
    const source = createInMemorySource({
      'tsconfig.json': '{\n  "compilerOptions": {\n    "target": "ES2022"\n  }\n}',
    });
    const plan = await planFixes([finding('ts-strict-off')], source);

    expect(plan.files[0].patched).toContain('"strict": true,');
    expect(plan.files[0].patched).toContain('"target": "ES2022"');
  });

  it('refuses when there is no compilerOptions block', async () => {
    const source = createInMemorySource({ 'tsconfig.json': '{\n  "extends": "./base.json"\n}' });
    const plan = await planFixes([finding('ts-strict-off')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('No compilerOptions block');
  });
});

describe('.gitignore entries', () => {
  it('appends node_modules when the file exists', async () => {
    const source = createInMemorySource({ '.gitignore': '.next\n' });
    const plan = await planFixes([finding('gitignore-node-modules')], source);

    expect(plan.files[0].patched).toBe('.next\nnode_modules/\n');
  });

  it('creates the file when it is absent', async () => {
    const plan = await planFixes([finding('gitignore-node-modules')], createInMemorySource({}));

    expect(plan.files[0].original).toBeNull();
    expect(plan.files[0].patched).toBe('node_modules/\n');
  });

  it('adds the exact env file named by the finding id', async () => {
    const source = createInMemorySource({ '.gitignore': 'node_modules\n' });
    const plan = await planFixes([finding('security-env-exposed-.env.local')], source);

    expect(plan.files[0].patched).toContain('.env.local');
  });

  it('never claims a committed secret stops being tracked', async () => {
    // The audit only raises this after reading the file, so it is committed.
    // .gitignore governs untracked files, and saying otherwise would tell a
    // reader their credentials are safe while they are still published.
    const source = createInMemorySource({ '.gitignore': 'node_modules\n' });
    const plan = await planFixes([finding('security-env-exposed-.env')], source);
    const rationale = plan.applied[0].rationale;

    expect(rationale).not.toContain('stops being tracked');
    expect(rationale).toContain('git rm --cached .env');
    expect(rationale).toContain('rotate');
    expect(rationale).toContain('the pull request is itself a disclosure');
  });

  it('says what node_modules actually needs, without the secret warning', async () => {
    const plan = await planFixes([finding('gitignore-node-modules')], createInMemorySource({}));
    const rationale = plan.applied[0].rationale;

    expect(rationale).toContain('git rm -r --cached node_modules');
    expect(rationale).not.toContain('rotate');
  });

  it('refuses when the pattern is already ignored', async () => {
    const source = createInMemorySource({ '.gitignore': 'node_modules/\n' });
    const plan = await planFixes([finding('gitignore-node-modules')], source);

    expect(plan.files).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('already lists');
  });

  it('preserves CRLF line endings', async () => {
    const source = createInMemorySource({ '.gitignore': '.next\r\n' });
    const plan = await planFixes([finding('gitignore-node-modules')], source);

    expect(plan.files[0].patched).toBe('.next\r\nnode_modules/\r\n');
  });
});

describe('findings that need a person', () => {
  it('refuses a multi-stage split with a reason, not a generic message', async () => {
    const source = createInMemorySource({ Dockerfile: NODE_DOCKERFILE });
    const plan = await planFixes([finding('docker-single-stage')], source);

    expect(hasFixer('docker-single-stage')).toBe(false);
    expect(plan.refused[0].reason).toContain('what this image actually runs');
  });

  it('refuses to write a lockfile it cannot resolve', async () => {
    const plan = await planFixes([finding('deps-no-lockfile')], createInMemorySource({}));

    expect(plan.refused[0].reason).toContain('cannot be written from the outside');
  });
});

describe('a file that cannot be read', () => {
  /** A source that fails the way a dropped connection or a spent quota does. */
  const unreachable = {
    origin: 'unreachable',
    async read(): Promise<string | null> {
      throw new Error('fetch failed');
    },
  };

  it('reports it as unmeasured, never as a refusal', async () => {
    const plan = await planFixes([finding('docker-root-user')], unreachable);

    expect(plan.refused).toHaveLength(0);
    expect(plan.applied).toHaveLength(0);
    expect(plan.unavailable).toHaveLength(1);
    expect(plan.unavailable[0].reason).toContain('nothing was concluded');
    expect(plan.unavailable[0].reason).toContain('fetch failed');
  });

  it('keeps it out of the refusal section of the pull request body', async () => {
    const findings = [finding('docker-root-user', { title: 'Container runs as root' })];
    const body = describePlan(await planFixes(findings, unreachable), findings);

    expect(body).toContain('## Not measured');
    expect(body).not.toContain('## Left for you');
  });

  it('still refuses — not "unavailable" — when the file simply is not there', async () => {
    const plan = await planFixes([finding('docker-root-user')], createInMemorySource({}));

    expect(plan.unavailable).toHaveLength(0);
    expect(plan.refused[0].reason).toContain('could not be read');
  });
});

describe('describePlan', () => {
  it('reports what changed, what was left, and includes the diff', async () => {
    const source = createInMemorySource({
      Dockerfile: NODE_DOCKERFILE,
      'package-lock.json': '{}',
    });
    const findings = [
      finding('docker-root-user', { title: 'Container runs as root' }),
      finding('docker-single-stage', { title: 'Dockerfile without multi-stage build' }),
    ];
    const plan = await planFixes(findings, source);
    const body = describePlan(plan, findings);

    expect(body).toContain('## Changed');
    expect(body).toContain('Container runs as root');
    expect(body).toContain('## Left for you');
    expect(body).toContain('Dockerfile without multi-stage build');
    expect(body).toContain('```diff');
    expect(body).toContain('+USER node');
  });

  it('says plainly when nothing could be patched', async () => {
    const findings = [finding('docker-single-stage')];
    const plan = await planFixes(findings, createInMemorySource({}));

    expect(describePlan(plan, findings)).toContain('could not compute a safe edit');
  });
});
