import path from 'path';
import { createFileSystemSource, type ProjectSource } from './project-source';

export interface LocalAuditFinding {
  id: string;
  category: 'Dependencies' | 'Docker' | 'TypeScript' | 'Security';
  title: string;
  description: string;
  impact: 'Low' | 'Medium' | 'High';
  recommendation: string;
  autoFixAvailable: boolean;
  /** Exact text observed in the project that triggered this finding. */
  evidence: string;
  source: string;
}

export interface LocalAuditReport {
  projectName: string;
  /** Where the files were read from: a path, a repository, an archive. */
  origin: string;
  timestamp: string;
  /** False when the source tree is not reachable, e.g. a standalone container. */
  analyzable: boolean;
  filesInspected: string[];
  filesMissing: string[];
  /** Files that were read but could not be parsed, so nothing was concluded. */
  filesUnreadable: string[];
  findingsCount: number;
  findings: LocalAuditFinding[];
  notes: string[];
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'];

/*
 * There is no health score.
 *
 * An earlier version reported `100` minus a penalty per finding — 15, 8 or 3
 * by impact. Those weights came from nowhere: two projects sharing a 78 have
 * nothing in common, and the number could not be traced to any line of any
 * file, which is the one thing everything else here can do. A count can. The
 * audit reports how many findings it produced and what each one was read from,
 * and leaves the grading to whoever knows what the project is for.
 */

/**
 * tsconfig.json allows comments and trailing commas; JSON.parse does not.
 *
 * This scans character by character instead of using regular expressions,
 * because a path value such as "@/*" contains the characters that open a block
 * comment. A regex would treat it as one and swallow the rest of the file.
 */
function stripJsonc(raw: string): string {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += char;
  }

  return out;
}

/**
 * Removes commas that sit before a closing brace or bracket.
 *
 * This runs after comments are stripped, so a comma followed by a comment and
 * then a brace is handled: looking ahead in the original text would still see
 * the comment and keep the comma, which made the parse fail.
 */
function removeTrailingCommas(text: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      out += char;
      if (char === '\\') {
        out += text[i + 1] ?? '';
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === ',') {
      // Scan forward without allocating a substring for every comma.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }

    out += char;
  }

  return out;
}

/** Returns null only when the text is not valid JSON with comments. */
function parseJsonc(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(removeTrailingCommas(stripJsonc(raw)));
  } catch {
    return null;
  }
}

function inspectDockerfile(dockerfile: string, hasDockerignore: boolean): LocalAuditFinding[] {
  const findings: LocalAuditFinding[] = [];
  const fromLines = dockerfile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^FROM\s/i.test(line));

  const isMultiStage = fromLines.length > 1 && fromLines.some((line) => /\sAS\s/i.test(line));
  if (!isMultiStage) {
    findings.push({
      id: 'docker-single-stage',
      category: 'Docker',
      title: 'Dockerfile without multi-stage build',
      description:
        `The Dockerfile declares ${fromLines.length} build stage(s). Without separate build and runtime stages, ` +
        'compilers and dev dependencies ship inside the production image.',
      impact: 'High',
      recommendation: 'Split the Dockerfile into a builder stage and a slim runtime stage.',
      autoFixAvailable: false,
      evidence: fromLines.join(' | ') || 'no FROM instruction found',
      source: 'Dockerfile',
    });
  }

  if (!/^FROM\s+\S*(alpine|slim)/im.test(dockerfile)) {
    findings.push({
      id: 'docker-heavy-base',
      category: 'Docker',
      title: 'Runtime image does not use a slim base',
      description: 'No alpine or slim base image was found, which inflates image size and attack surface.',
      impact: 'Medium',
      recommendation: 'Use an -alpine or -slim tag for the runtime stage.',
      autoFixAvailable: false,
      evidence: fromLines.join(' | '),
      source: 'Dockerfile',
    });
  }

  if (!/^\s*USER\s+/im.test(dockerfile)) {
    findings.push({
      id: 'docker-root-user',
      category: 'Security',
      title: 'Container runs as root',
      description: 'No USER instruction is present, so the process runs as root inside the container.',
      impact: 'Medium',
      recommendation: 'Create an unprivileged user and add a USER instruction before CMD.',
      autoFixAvailable: false,
      evidence: 'no USER instruction in Dockerfile',
      source: 'Dockerfile',
    });
  }

  // A base image without a tag, or on :latest, means the same Dockerfile builds
  // a different image tomorrow.
  const unpinned = fromLines.filter((line) => {
    const image = line.split(/\s+/)[1] ?? '';
    if (image.startsWith('$')) return false;
    const reference = image.split('@')[0];
    const tag = reference.includes(':') ? reference.split(':').pop() : undefined;
    return !image.includes('@sha256:') && (!tag || tag === 'latest');
  });

  if (unpinned.length > 0) {
    findings.push({
      id: 'docker-unpinned-base',
      category: 'Docker',
      title: 'Base image is not pinned to a version',
      description:
        'A base image with no tag, or on latest, resolves to whatever is current at build time, so the same Dockerfile produces different images over time.',
      impact: 'Medium',
      recommendation: 'Pin the base image to a version tag, or to a digest for an exact build.',
      autoFixAvailable: false,
      evidence: unpinned.join(' | '),
      source: 'Dockerfile',
    });
  }

  if (/^\s*COPY\s+\.\s+\.\s*$/im.test(dockerfile) && !hasDockerignore) {
    findings.push({
      id: 'docker-copy-all',
      category: 'Security',
      title: 'COPY . . without a .dockerignore',
      description:
        'The whole working directory is copied into the image with nothing excluded, so .env files, .git history and node_modules ship inside the container.',
      impact: 'High',
      recommendation: 'Add a .dockerignore covering .git, node_modules, .env* and build output.',
      autoFixAvailable: false,
      evidence: 'COPY . . and no .dockerignore in the project',
      source: 'Dockerfile',
    });
  }

  const remoteAdd = dockerfile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^ADD\s+https?:\/\//i.test(line));
  if (remoteAdd.length > 0) {
    findings.push({
      id: 'docker-remote-add',
      category: 'Security',
      title: 'ADD fetches a file over the network',
      description:
        'ADD with a URL downloads at build time without verifying what arrived, so the image contents depend on a third party staying honest and available.',
      impact: 'Medium',
      recommendation: 'Download with curl and verify a checksum, or vendor the file into the repository.',
      autoFixAvailable: false,
      evidence: remoteAdd.join(' | '),
      source: 'Dockerfile',
    });
  }

  if (/RUN\s+npm\s+install/i.test(dockerfile) && !/RUN\s+npm\s+ci/i.test(dockerfile)) {
    findings.push({
      id: 'docker-npm-install',
      category: 'Dependencies',
      title: 'Image build uses npm install instead of npm ci',
      description:
        'npm install may resolve versions differently than the lockfile, which makes builds non-reproducible.',
      impact: 'Medium',
      recommendation: 'Use npm ci so the build always matches package-lock.json.',
      autoFixAvailable: false,
      evidence: 'RUN npm install',
      source: 'Dockerfile',
    });
  }

  return findings;
}

/** Audits whatever the given source exposes. */
export async function auditProject(source: ProjectSource): Promise<LocalAuditReport> {
  const timestamp = new Date().toISOString();
  const filesInspected: string[] = [];
  const filesMissing: string[] = [];
  const filesUnreadable: string[] = [];
  const findings: LocalAuditFinding[] = [];
  const notes: string[] = [];

  const track = (relative: string, content: string | null) => {
    if (content === null) filesMissing.push(relative);
    else filesInspected.push(relative);
    return content;
  };

  const packageJsonRaw = track('package.json', await source.read('package.json'));

  if (!packageJsonRaw) {
    return {
      projectName: 'unknown',
      origin: source.origin,
      timestamp,
      analyzable: false,
      filesInspected,
      filesMissing,
      filesUnreadable,
      findingsCount: 0,
      findings: [],
      notes: [
        `No package.json was found at ${source.origin}, so no static analysis ran.`,
        'This is expected when the app serves from a standalone build that does not ship its own source tree.',
      ],
    };
  }

  const parsedPackageJson = parseJsonc(packageJsonRaw) as {
    name?: string;
    engines?: { node?: string };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null;

  // Treating an unparseable package.json as an empty object would report a
  // missing "engines" field on a project that declares one. Not being able to
  // read a file is its own outcome, never a finding about the project.
  if (!parsedPackageJson) {
    filesUnreadable.push('package.json');
    return {
      projectName: path.basename(source.origin),
      origin: source.origin,
      timestamp,
      analyzable: false,
      filesInspected,
      filesMissing,
      filesUnreadable,
      findingsCount: 0,
      findings: [],
      notes: [`package.json at ${source.origin} could not be parsed, so no checks ran.`],
    };
  }

  const packageJson = parsedPackageJson;
  const projectName = packageJson.name ?? path.basename(source.origin);

  const dockerfile = track('Dockerfile', await source.read('Dockerfile'));
  if (dockerfile) {
    const hasDockerignore = (await source.read('.dockerignore')) !== null;
    findings.push(...inspectDockerfile(dockerfile, hasDockerignore));
  } else {
    notes.push('No Dockerfile found, so container checks were skipped.');
  }

  const tsconfigRaw = track('tsconfig.json', await source.read('tsconfig.json'));
  if (tsconfigRaw) {
    const tsconfig = parseJsonc(tsconfigRaw) as { compilerOptions?: { strict?: boolean } } | null;

    if (!tsconfig) {
      filesUnreadable.push('tsconfig.json');
      notes.push('tsconfig.json could not be parsed, so the strict mode check was skipped.');
    } else {
      const strict = tsconfig.compilerOptions?.strict;
      if (strict !== true) {
        findings.push({
          id: 'ts-strict-off',
          category: 'TypeScript',
          title: 'TypeScript strict mode is disabled',
          description:
            'compilerOptions.strict is not set to true, so null checks and implicit any are not enforced.',
          impact: 'Medium',
          recommendation: 'Set "strict": true in tsconfig.json and fix the errors it surfaces.',
          autoFixAvailable: false,
          evidence: `"strict": ${JSON.stringify(strict ?? null)}`,
          source: 'tsconfig.json',
        });
      }
    }
  }

  // npm is not the only package manager, and flagging a pnpm or yarn project
  // for having no package-lock.json would be a false finding.
  const foundLockfiles: string[] = [];
  for (const candidate of LOCKFILES) {
    const content = track(candidate, await source.read(candidate));
    if (content !== null) foundLockfiles.push(candidate);
  }

  if (foundLockfiles.length === 0) {
    findings.push({
      id: 'deps-no-lockfile',
      category: 'Dependencies',
      title: 'No lockfile committed',
      description:
        'Without a lockfile, two installs of the same commit can resolve to different dependency versions.',
      impact: 'High',
      recommendation: 'Commit the lockfile your package manager produces and install from it.',
      autoFixAvailable: false,
      evidence: `none of ${LOCKFILES.join(', ')} was found`,
      source: 'package.json',
    });
  }

  if (!packageJson.engines?.node) {
    findings.push({
      id: 'deps-no-engines',
      category: 'Dependencies',
      title: 'Node version is not pinned',
      description:
        'package.json does not declare engines.node, so local, CI and production can silently run different runtimes.',
      impact: 'Low',
      recommendation: 'Declare the supported Node range under "engines" in package.json.',
      autoFixAvailable: false,
      evidence: 'no "engines" field',
      source: 'package.json',
    });
  }

  // A dependency resolved from git or a URL bypasses the registry, so nothing
  // pins what it contains and no advisory database covers it.
  const allDeps: Record<string, string> = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  const remoteDeps = Object.entries(allDeps)
    .filter(([, spec]) => /^(git\+|git:|https?:|github:|file:)/i.test(spec))
    .map(([name, spec]) => `${name}: ${spec}`);

  if (remoteDeps.length > 0) {
    findings.push({
      id: 'deps-remote-source',
      category: 'Dependencies',
      title: 'Dependency installed from outside the registry',
      description:
        'A dependency pointing at git, a URL or a local path is not covered by the npm advisory database and can change without a version bump.',
      impact: 'Medium',
      recommendation: 'Publish the package to a registry, or vendor it and pin the exact commit.',
      autoFixAvailable: false,
      evidence: remoteDeps.join(' | '),
      source: 'package.json',
    });
  }

  const gitignore = track('.gitignore', await source.read('.gitignore'));

  // "/node_modules" is what every Next and CRA template writes, and it ignores
  // the directory just as well as the bare name. Demanding one spelling would
  // report a false finding on most of the ecosystem.
  const ignoresNodeModules =
    !!gitignore && /^\s*(?:\*\*\/)?\/?node_modules\/?\s*$/m.test(gitignore);

  if (gitignore && !ignoresNodeModules) {
    findings.push({
      id: 'gitignore-node-modules',
      category: 'Security',
      title: 'node_modules is not ignored by git',
      description:
        'Without that rule the dependency tree can be committed, which bloats the repository and ships whatever was installed locally.',
      impact: 'Low',
      recommendation: 'Add node_modules to .gitignore.',
      autoFixAvailable: false,
      evidence: 'no node_modules rule in .gitignore',
      source: '.gitignore',
    });
  }

  const ignoresEnv = !!gitignore && /^\s*\.env/m.test(gitignore);
  for (const envFile of ['.env', '.env.local', '.env.production']) {
    const present = await source.read(envFile);
    if (present !== null && !ignoresEnv) {
      findings.push({
        id: `security-env-exposed-${envFile}`,
        category: 'Security',
        title: `${envFile} is present and not covered by .gitignore`,
        description: 'A secrets file that git does not ignore can be committed and published by accident.',
        impact: 'High',
        recommendation: `Add ${envFile} to .gitignore and rotate any credential that was already committed.`,
        autoFixAvailable: false,
        evidence: `${envFile} exists and .gitignore has no matching .env rule`,
        source: '.gitignore',
      });
    }
  }

  // A Next standalone image ships a generated package.json next to server.js,
  // with no lockfile or config beside them. Auditing that would report "no
  // lockfile committed" about a container's runtime directory: technically
  // true, entirely misleading. The pair — an entrypoint with none of the files
  // a checkout carries — is what identifies a runtime rather than a source
  // tree, and a real project missing its lockfile is still reported.
  const carriesProjectFile = filesInspected.some((file) =>
    [...LOCKFILES, 'Dockerfile', 'tsconfig.json', '.gitignore'].includes(file),
  );
  const hasStandaloneEntrypoint = (await source.read('server.js')) !== null;

  if (hasStandaloneEntrypoint && !carriesProjectFile) {
    return {
      projectName,
      origin: source.origin,
      timestamp,
      analyzable: false,
      filesInspected,
      filesMissing,
      filesUnreadable,
      findingsCount: 0,
      findings: [],
      notes: [
        `${source.origin} holds a server.js and a package.json, with none of the files a checkout carries, so it is a deployed runtime rather than a source tree.`,
        'Point the audit at a repository instead.',
      ],
    };
  }

  return {
    projectName,
    origin: source.origin,
    timestamp,
    analyzable: true,
    filesInspected,
    filesMissing,
    filesUnreadable,
    findingsCount: findings.length,
    findings,
    notes,
  };
}

/** Convenience wrapper for auditing a directory on this machine. */
export function auditLocalProject(projectRoot = process.cwd()): Promise<LocalAuditReport> {
  return auditProject(createFileSystemSource(projectRoot));
}
