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
  healthScore: number | null;
  findingsCount: number;
  findings: LocalAuditFinding[];
  notes: string[];
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'];

const IMPACT_PENALTY: Record<LocalAuditFinding['impact'], number> = {
  High: 15,
  Medium: 8,
  Low: 3,
};

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

function inspectDockerfile(dockerfile: string): LocalAuditFinding[] {
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
      healthScore: null,
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
      healthScore: null,
      findingsCount: 0,
      findings: [],
      notes: [`package.json at ${source.origin} could not be parsed, so no checks ran.`],
    };
  }

  const packageJson = parsedPackageJson;
  const projectName = packageJson.name ?? path.basename(source.origin);

  const dockerfile = track('Dockerfile', await source.read('Dockerfile'));
  if (dockerfile) {
    findings.push(...inspectDockerfile(dockerfile));
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

  const gitignore = track('.gitignore', await source.read('.gitignore'));
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

  const penalty = findings.reduce((sum, finding) => sum + IMPACT_PENALTY[finding.impact], 0);

  return {
    projectName,
    origin: source.origin,
    timestamp,
    analyzable: true,
    filesInspected,
    filesMissing,
    filesUnreadable,
    healthScore: Math.max(0, Math.min(100, 100 - penalty)),
    findingsCount: findings.length,
    findings,
    notes,
  };
}

/** Convenience wrapper for auditing a directory on this machine. */
export function auditLocalProject(projectRoot = process.cwd()): Promise<LocalAuditReport> {
  return auditProject(createFileSystemSource(projectRoot));
}
