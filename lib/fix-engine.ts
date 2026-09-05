import type { LocalAuditFinding } from './local-project-analyzer';
import type { ProjectSource } from './project-source';
import { ignoresPath } from './gitignore';

/**
 * Computes the edit that resolves a finding, from the file that produced it.
 *
 * The audit's rule has always been that a claim must trace back to a line in a
 * real file. A patch is held to the same rule: every change here is an edit
 * applied to text the fixer just read, never a replacement file generated from
 * a template. When the anchor a fix depends on is not in the file, or a
 * precondition does not hold — `npm ci` without a lockfile, `USER node` on an
 * image that has no node user — the fixer refuses and says why, and the finding
 * falls back to being reported rather than silently half-fixed.
 */

export interface FilePatch {
  filePath: string;
  /** null when the fix creates a file that did not exist. */
  original: string | null;
  patched: string;
  diff: string;
  /** The findings this file's edits resolve. */
  findingIds: string[];
}

export interface AppliedFix {
  findingId: string;
  filePath: string;
  rationale: string;
}

export interface RefusedFix {
  findingId: string;
  reason: string;
}

export interface UnavailableFix {
  findingId: string;
  reason: string;
}

export interface PatchPlan {
  files: FilePatch[];
  applied: AppliedFix[];
  /** Decided against: a precondition in the repository does not hold. */
  refused: RefusedFix[];
  /** Not decided at all: the files needed to judge could not be read. */
  unavailable: UnavailableFix[];
}

/* ------------------------------------------------------------------ *
 * Unified diff
 * ------------------------------------------------------------------ */

type DiffOp = { type: ' ' | '-' | '+'; text: string };

/**
 * Longest common subsequence over lines.
 *
 * The files a fix touches are configuration — a Dockerfile, a tsconfig, a
 * .gitignore — so the quadratic table is a few hundred cells. Anything larger
 * than LCS_LINE_LIMIT skips the table and reports a whole-file replacement,
 * because a diff nobody can read is worse than an honest summary.
 */
const LCS_LINE_LIMIT = 2000;

function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;

  if (n > LCS_LINE_LIMIT || m > LCS_LINE_LIMIT) {
    return [
      ...a.map((text): DiffOp => ({ type: '-', text })),
      ...b.map((text): DiffOp => ({ type: '+', text })),
    ];
  }

  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: ' ', text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: '-', text: a[i] });
      i += 1;
    } else {
      ops.push({ type: '+', text: b[j] });
      j += 1;
    }
  }

  while (i < n) {
    ops.push({ type: '-', text: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: '+', text: b[j] });
    j += 1;
  }

  return ops;
}

/** Renders a unified diff with the usual three lines of context. */
export function unifiedDiff(
  filePath: string,
  original: string | null,
  patched: string,
  context = 3,
): string {
  const a = original === null ? [] : original.split('\n');
  const b = patched.split('\n');
  const ops = diffLines(a, b);

  const changedAt = ops
    .map((op, index) => (op.type === ' ' ? -1 : index))
    .filter((index) => index >= 0);

  if (changedAt.length === 0) return '';

  // Group changes that sit within 2*context of each other into one hunk, so
  // two edits to the same file do not print the lines between them twice.
  const groups: Array<[number, number]> = [];
  let start = changedAt[0];
  let end = changedAt[0];

  for (const index of changedAt.slice(1)) {
    if (index - end <= context * 2) {
      end = index;
    } else {
      groups.push([start, end]);
      start = index;
      end = index;
    }
  }
  groups.push([start, end]);

  const lines: string[] = [
    `--- ${original === null ? '/dev/null' : `a/${filePath}`}`,
    `+++ b/${filePath}`,
  ];

  for (const [from, to] of groups) {
    const first = Math.max(0, from - context);
    const last = Math.min(ops.length - 1, to + context);

    let aStart = 0;
    let bStart = 0;
    for (let k = 0; k < first; k += 1) {
      if (ops[k].type !== '+') aStart += 1;
      if (ops[k].type !== '-') bStart += 1;
    }

    let aCount = 0;
    let bCount = 0;
    const body: string[] = [];
    for (let k = first; k <= last; k += 1) {
      const op = ops[k];
      if (op.type !== '+') aCount += 1;
      if (op.type !== '-') bCount += 1;
      body.push(`${op.type}${op.text}`);
    }

    lines.push(`@@ -${aStart + 1},${aCount} +${bStart + 1},${bCount} @@`);
    lines.push(...body);
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Working copy
 * ------------------------------------------------------------------ */

/**
 * The set of files a plan is editing.
 *
 * Two findings often touch one file — a Dockerfile missing both USER and
 * `npm ci` — so each fixer reads the running copy rather than the original,
 * and the plan emits one diff per file instead of two conflicting ones.
 */
class WorkingCopy {
  private originals = new Map<string, string | null>();
  private current = new Map<string, string>();
  private contributors = new Map<string, string[]>();

  constructor(private readonly source: ProjectSource) {}

  async read(filePath: string): Promise<string | null> {
    if (this.current.has(filePath)) return this.current.get(filePath) as string;
    if (!this.originals.has(filePath)) {
      this.originals.set(filePath, await this.source.read(filePath));
    }
    return this.originals.get(filePath) ?? null;
  }

  async write(filePath: string, content: string, findingId: string): Promise<void> {
    if (!this.originals.has(filePath)) {
      this.originals.set(filePath, await this.source.read(filePath));
    }
    this.current.set(filePath, content);
    const list = this.contributors.get(filePath) ?? [];
    if (!list.includes(findingId)) list.push(findingId);
    this.contributors.set(filePath, list);
  }

  toPatches(): FilePatch[] {
    const patches: FilePatch[] = [];

    for (const [filePath, patched] of this.current) {
      const original = this.originals.get(filePath) ?? null;
      if (original === patched) continue;
      patches.push({
        filePath,
        original,
        patched,
        diff: unifiedDiff(filePath, original, patched),
        findingIds: this.contributors.get(filePath) ?? [],
      });
    }

    return patches.sort((left, right) => left.filePath.localeCompare(right.filePath));
  }
}

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

/** Keeps CRLF files CRLF. Rewriting line endings turns a 3-line fix into a whole-file diff. */
function lineEnding(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function appendLine(existing: string | null, line: string): string {
  if (existing === null || existing.trim() === '') return `${line}\n`;
  const eol = lineEnding(existing);
  const needsBreak = !existing.endsWith('\n') && !existing.endsWith('\r\n');
  return `${existing}${needsBreak ? eol : ''}${line}${eol}`;
}


/* ------------------------------------------------------------------ *
 * Fixers
 * ------------------------------------------------------------------ */

type FixOutcome = { ok: true; rationale: string; filePath: string } | { ok: false; reason: string };

type Fixer = (finding: LocalAuditFinding, copy: WorkingCopy) => Promise<FixOutcome>;

/**
 * Resolves the image the *last* stage is built on, following stage aliases.
 *
 * Only the final stage becomes the running container. A multi-stage build that
 * compiles on `node:20` and then serves from `nginx` is a node build producing
 * an nginx image, and a fix that reads any FROM in the file would conclude the
 * opposite. `FROM builder` is followed back through `AS` names — bounded,
 * because a malformed file can name a cycle.
 */
function finalStageBase(dockerfile: string): string | null {
  const stages: Array<{ image: string; alias?: string }> = [];

  for (const line of splitLines(dockerfile)) {
    const match = line.match(/^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i);
    if (match) stages.push({ image: match[1], alias: match[2]?.toLowerCase() });
  }

  if (stages.length === 0) return null;

  let image = stages[stages.length - 1].image;

  for (let hops = 0; hops < stages.length; hops += 1) {
    const referenced = stages.find((stage) => stage.alias === image.toLowerCase());
    if (!referenced) return image;
    image = referenced.image;
  }

  return null;
}

/**
 * Adds USER before the process starts.
 *
 * Two guards, both learned from real Dockerfiles. The base image of the final
 * stage must be an official node image, because `USER node` on an image without
 * that account produces a container that will not start — a worse outcome than
 * the finding it closes. And the process being switched must not be an
 * entrypoint script: those routinely chown a volume or create a directory
 * before dropping privileges themselves, and whether this one needs root is a
 * fact about a file the audit never read.
 */
const fixDockerRootUser: Fixer = async (finding, copy) => {
  const dockerfile = await copy.read('Dockerfile');
  if (dockerfile === null) return { ok: false, reason: 'Dockerfile could not be read.' };

  const base = finalStageBase(dockerfile);

  if (base === null || !/^\S*node(:|$)/i.test(base)) {
    return {
      ok: false,
      reason:
        `The final stage is built on ${base ?? 'an image that could not be resolved'}, not an official ` +
        'node image, so the unprivileged user this fix would switch to may not exist. Add the user that ' +
        'image provides instead.',
    };
  }

  const lines = splitLines(dockerfile);

  // USER applies to every instruction after it, and only the last stage is the
  // container that runs, so both the search and the insertion stay inside it.
  const stageStart = lines.reduce(
    (last, line, index) => (/^\s*FROM\s/i.test(line) ? index : last),
    -1,
  );
  const inFinalStage = (index: number) => index > stageStart;

  // A startup script is disqualifying wherever it sits. An ENTRYPOINT runs
  // before CMD and under the same user, so a script there counts even when a
  // CMD follows it; and a CMD that is itself a script carries the same risk.
  const startupScript = lines.findIndex(
    (line, index) =>
      inFinalStage(index) && /^\s*(CMD|ENTRYPOINT)\s/i.test(line) && /\.sh\b/.test(line),
  );

  if (startupScript !== -1) {
    return {
      ok: false,
      reason:
        `The final stage starts through a shell script (${lines[startupScript].trim()}). Startup scripts ` +
        'routinely prepare a volume or directory as root before dropping privileges themselves, and ' +
        'whether this one needs root is written in a file this audit does not read.',
    };
  }

  const target = lines.reduce(
    (last, line, index) =>
      inFinalStage(index) && /^\s*(CMD|ENTRYPOINT)\s/i.test(line) ? index : last,
    -1,
  );

  if (target === -1) {
    return {
      ok: false,
      reason: 'The final stage has no CMD or ENTRYPOINT to place the USER instruction before.',
    };
  }

  const instruction = /^\s*ENTRYPOINT\s/i.test(lines[target]) ? 'ENTRYPOINT' : 'CMD';

  // Files arrive owned by root unless a COPY says otherwise, so an app that
  // writes inside its own directory will fail as a non-root user. Whether it
  // writes is not in this file, so it is said rather than assumed.
  const chowned = lines.some(
    (line, index) => inFinalStage(index) && /^\s*COPY\s/i.test(line) && /--chown=/i.test(line),
  );

  lines.splice(target, 0, 'USER node', '');
  await copy.write('Dockerfile', lines.join(lineEnding(dockerfile)), finding.id);

  return {
    ok: true,
    filePath: 'Dockerfile',
    rationale:
      `Added \`USER node\` before the final ${instruction}, so the process drops root before it starts. ` +
      `The final stage runs on ${base}, which provides that user.` +
      (chowned
        ? ''
        : ' No COPY in this stage sets --chown, so files are owned by root: check that the app does not ' +
          'write inside its own directory at runtime.'),
  };
};

/**
 * Switches the build to `npm ci`.
 *
 * `npm ci` deletes node_modules and installs strictly from the lockfile, and it
 * exits non-zero when there is no lockfile to install from. Without one
 * committed, this "fix" would break the build on the next push.
 */
/**
 * True only for an `npm install` that `npm ci` is actually equivalent to.
 *
 * `npm ci` installs the current project from its lockfile. It takes no package
 * argument and has no global mode, so `npm install -g @scope/cli` and
 * `npm install lodash` are different operations entirely — rewriting either
 * produces a command that fails immediately. Only a bare install, with flags
 * and nothing positional, may be swapped.
 */
function isPlainInstall(tail: string): boolean {
  const tokens = tail.trim().split(/\s+/).filter(Boolean);
  return tokens.every((token) => token.startsWith('-')) &&
    !tokens.some((token) => /^(-g|--global|--prefix(=.*)?)$/.test(token));
}

const fixDockerNpmInstall: Fixer = async (finding, copy) => {
  const dockerfile = await copy.read('Dockerfile');
  if (dockerfile === null) return { ok: false, reason: 'Dockerfile could not be read.' };

  const lockfile = await copy.read('package-lock.json');
  if (lockfile === null) {
    return {
      ok: false,
      reason:
        'No package-lock.json is committed, and npm ci fails without one. Commit the lockfile first, then this fix becomes safe.',
    };
  }

  const lines = splitLines(dockerfile);
  let rewrote = false;
  let skippedGlobal = false;
  let skippedNoLockInImage = false;
  let stageStart = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*FROM\s/i.test(lines[index])) {
      stageStart = index;
      continue;
    }

    const match = lines[index].match(/npm\s+install\b([^&\n\\|;]*)/i);
    if (!match) continue;

    if (!isPlainInstall(match[1])) {
      skippedGlobal = true;
      continue;
    }

    if (!lockfileReachesImage(lines, stageStart, index)) {
      skippedNoLockInImage = true;
      continue;
    }

    lines[index] = lines[index].replace(/npm\s+install\b/i, 'npm ci');
    rewrote = true;
  }

  if (!rewrote) {
    const reason = skippedNoLockInImage
      ? 'The stage copies package.json without the lockfile, and `npm ci` reads the lockfile from inside ' +
        'the image, not from the repository. It would fail with "npm ci can only install with an existing ' +
        'package-lock.json". Copy the lockfile in first, and this fix becomes safe.'
      : skippedGlobal
        ? 'Every `npm install` here names a package or installs globally, and `npm ci` does neither — it ' +
          'installs the current project from its lockfile. Rewriting them would break the build.'
        : 'No `npm install` line was found to rewrite.';

    return { ok: false, reason };
  }

  await copy.write('Dockerfile', lines.join(lineEnding(dockerfile)), finding.id);

  return {
    ok: true,
    filePath: 'Dockerfile',
    rationale:
      'Replaced the project `npm install` with `npm ci`, so the image matches package-lock.json.' +
      (skippedGlobal ? ' Global installs of named packages were left alone: `npm ci` cannot do that.' : '') +
      (skippedNoLockInImage
        ? ' One install was left alone because its stage never copies the lockfile into the image.'
        : '') +
      ' `npm ci` also requires the lockfile to be in sync with package.json, which a build will confirm.',
  };
};

/**
 * Whether the lockfile is inside the image by the time the install runs.
 *
 * `npm ci` reads package-lock.json from the working directory of the container,
 * not from the repository. A stage that copies `package.json` on its own — a
 * common way to cache the dependency layer — has the lockfile committed and
 * still absent where it is needed.
 */
function lockfileReachesImage(lines: string[], stageStart: number, before: number): boolean {
  for (let index = stageStart + 1; index < before; index += 1) {
    const line = lines[index];
    if (!/^\s*(COPY|ADD)\s/i.test(line)) continue;
    if (/package-lock\.json|package\*/i.test(line)) return true;
    // Copying the whole build context brings the lockfile with everything else.
    if (/^\s*COPY\s+(?:--\S+\s+)*\.\s+\S/.test(line)) return true;
  }
  return false;
}

/**
 * Writes a .dockerignore built from this project's own .gitignore.
 *
 * The entries come from what the repository already declares it does not track,
 * plus the four things that must never enter an image. Nothing is invented from
 * a template of a typical Node project.
 */
const fixDockerCopyAll: Fixer = async (finding, copy) => {
  const existing = await copy.read('.dockerignore');
  if (existing !== null && existing.trim() !== '') {
    return { ok: false, reason: 'A .dockerignore already exists; it was left alone.' };
  }

  const gitignore = await copy.read('.gitignore');
  const fromGitignore = gitignore
    ? splitLines(gitignore)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('!'))
    : [];

  const mandatory = ['.git', 'node_modules', '.env', '.env.*', 'Dockerfile', '.dockerignore'];
  const entries = [...mandatory];
  for (const entry of fromGitignore) {
    if (!entries.includes(entry)) entries.push(entry);
  }

  const header = gitignore
    ? '# Generated by Sentinel from this repository\'s .gitignore.'
    : '# Generated by Sentinel. No .gitignore was present to read.';

  await copy.write('.dockerignore', `${header}\n${entries.join('\n')}\n`, finding.id);

  return {
    ok: true,
    filePath: '.dockerignore',
    rationale: `Created .dockerignore with ${entries.length} entries, taken from .gitignore plus .git, node_modules and .env*.`,
  };
};

/**
 * Turns on strict as a text edit, so comments and formatting in tsconfig survive.
 *
 * This is the one fix here whose blast radius is the whole project rather than
 * the line it changes: every file is type-checked again under stricter rules,
 * and on a codebase that never had it on, the build can fail with hundreds of
 * errors. The edit is still correct, so it is offered — but the rationale says
 * plainly that it is unverified, because a reader who merges this on the
 * strength of a green checkmark has been misled by us.
 */
const STRICT_CAVEAT =
  ' This re-checks every file in the project, so run a type check before merging: unlike the other ' +
  'fixes here, its effect is not confined to the lines it changed.';

const fixTsStrict: Fixer = async (finding, copy) => {
  const tsconfig = await copy.read('tsconfig.json');
  if (tsconfig === null) return { ok: false, reason: 'tsconfig.json could not be read.' };

  if (/"strict"\s*:\s*false/.test(tsconfig)) {
    const patched = tsconfig.replace(/("strict"\s*:\s*)false/, '$1true');
    await copy.write('tsconfig.json', patched, finding.id);
    return {
      ok: true,
      filePath: 'tsconfig.json',
      rationale: `Set \`"strict": true\` in compilerOptions.${STRICT_CAVEAT}`,
    };
  }

  const match = tsconfig.match(/"compilerOptions"\s*:\s*\{/);
  if (!match || match.index === undefined) {
    return { ok: false, reason: 'No compilerOptions block was found to add strict to.' };
  }

  const insertAt = match.index + match[0].length;
  const eol = lineEnding(tsconfig);
  const patched = `${tsconfig.slice(0, insertAt)}${eol}    "strict": true,${tsconfig.slice(insertAt)}`;

  await copy.write('tsconfig.json', patched, finding.id);

  return {
    ok: true,
    filePath: 'tsconfig.json',
    rationale: `Added \`"strict": true\` to compilerOptions.${STRICT_CAVEAT}`,
  };
};

/** Pins the base image to the major version the project already declares it needs. */
const fixDockerUnpinnedBase: Fixer = async (finding, copy) => {
  const dockerfile = await copy.read('Dockerfile');
  if (dockerfile === null) return { ok: false, reason: 'Dockerfile could not be read.' };

  const packageJson = await copy.read('package.json');
  const engines = packageJson?.match(/"node"\s*:\s*"([^"]+)"/);
  const major = engines?.[1].match(/(\d+)/)?.[1];

  if (!major) {
    return {
      ok: false,
      reason:
        'The project does not declare engines.node, so there is no version in the repository to pin to. Picking one here would be a guess.',
    };
  }

  const patched = dockerfile.replace(
    /^(FROM\s+)(node)(:latest)?(\s|$)/gim,
    (_match, from: string, image: string, _tag: string | undefined, tail: string) =>
      `${from}${image}:${major}${tail}`,
  );

  if (patched === dockerfile) {
    return {
      ok: false,
      reason: 'The unpinned image is not the official node image, so its tags cannot be derived from engines.node.',
    };
  }

  await copy.write('Dockerfile', patched, finding.id);

  return {
    ok: true,
    filePath: 'Dockerfile',
    rationale: `Pinned the base image to node:${major}, the major version declared in engines.node.`,
  };
};

/** Declares the Node version the Dockerfile already builds against. */
const fixMissingEngines: Fixer = async (finding, copy) => {
  const packageJson = await copy.read('package.json');
  if (packageJson === null) return { ok: false, reason: 'package.json could not be read.' };

  const dockerfile = await copy.read('Dockerfile');
  const major = dockerfile?.match(/^FROM\s+\S*node:(\d+)/im)?.[1];

  if (!major) {
    return {
      ok: false,
      reason:
        'No pinned node version exists anywhere in the repository to copy, so any value written here would be invented.',
    };
  }

  const opening = packageJson.indexOf('{');
  if (opening === -1) return { ok: false, reason: 'package.json does not parse as an object.' };

  const eol = lineEnding(packageJson);
  const patched =
    `${packageJson.slice(0, opening + 1)}${eol}  "engines": {${eol}    "node": ">=${major}.0.0"${eol}  },` +
    `${packageJson.slice(opening + 1)}`;

  await copy.write('package.json', patched, finding.id);

  return {
    ok: true,
    filePath: 'package.json',
    rationale: `Declared engines.node as >=${major}.0.0, matching the node:${major} image the Dockerfile builds on.`,
  };
};

/** Appends one entry to .gitignore, creating the file when it is absent. */
/**
 * Adds one entry to .gitignore.
 *
 * The rationale used to say the path "stops being tracked", which is false and
 * was the most dangerous sentence this engine produced. .gitignore governs
 * untracked files only: a file git already knows about stays tracked, keeps
 * being committed, and remains in every past commit regardless. For a stray
 * node_modules that is a nuisance. For a committed .env it means the
 * credentials are still published and still in the history, while the patch
 * congratulates the reader for fixing it.
 *
 * `alreadyCommitted` is known because the audit only raises the finding after
 * reading the file out of the project, so what the rationale says next is a
 * fact about this repository rather than a general warning.
 */
function ignoreEntryFixer(pattern: string, options: { label: string; secret?: boolean }): Fixer {
  return async (finding, copy) => {
    const gitignore = await copy.read('.gitignore');

    // Asked about the path itself, not the spelling of the rule: a project
    // that already writes `/node_modules` must not have `node_modules/`
    // appended underneath it.
    if (ignoresPath(gitignore, pattern.replace(/\/$/, ''))) {
      return { ok: false, reason: `.gitignore already lists ${pattern}.` };
    }

    await copy.write('.gitignore', appendLine(gitignore, pattern), finding.id);

    const wrote = gitignore === null ? `Created .gitignore with ${pattern}` : `Added ${pattern} to .gitignore`;

    if (!options.secret) {
      return {
        ok: true,
        filePath: '.gitignore',
        rationale:
          `${wrote}, so ${options.label} is not added to a future commit. Anything already ` +
          `committed stays tracked until \`git rm -r --cached ${pattern.replace(/\/$/, '')}\` removes it.`,
      };
    }

    return {
      ok: true,
      filePath: '.gitignore',
      rationale:
        `${wrote}. This alone changes nothing about the file that is already there: .gitignore ` +
        `governs untracked files, so ${pattern} stays committed until \`git rm --cached ${pattern}\`, ` +
        `and stays readable in every past commit after that. Treat every value in it as public and ` +
        `rotate it. Do not open a public pull request describing this before the credentials are ` +
        `rotated — the pull request is itself a disclosure.`,
    };
  };
}

const FIXERS: Record<string, Fixer> = {
  'docker-root-user': fixDockerRootUser,
  'docker-npm-install': fixDockerNpmInstall,
  'docker-copy-all': fixDockerCopyAll,
  'docker-unpinned-base': fixDockerUnpinnedBase,
  'ts-strict-off': fixTsStrict,
  'deps-no-engines': fixMissingEngines,
  'gitignore-node-modules': ignoreEntryFixer('node_modules/', { label: 'the dependency tree' }),
};

/**
 * Findings whose remedy is a design decision, not an edit.
 *
 * Splitting a Dockerfile into build and runtime stages, choosing a slim base,
 * or replacing a network ADD with a checksummed download all require knowing
 * what the image is for. Listing them here keeps the refusal specific instead
 * of letting them fall through to a generic "no fixer".
 */
const NEEDS_A_DECISION: Record<string, string> = {
  'docker-single-stage':
    'Splitting build and runtime stages depends on what this image actually runs, which the audit cannot see from the files it reads.',
  'docker-heavy-base':
    'Changing the base image can break native dependencies, so this one needs a build to verify rather than a patch.',
  'docker-remote-add':
    'Replacing ADD with a checksummed download requires the checksum of the file you intend to trust.',
  'deps-no-lockfile':
    'A lockfile has to be generated by the package manager resolving your dependency tree; it cannot be written from the outside.',
  'deps-remote-source':
    'Moving a dependency to the registry means choosing a published version to replace the git or URL reference.',
};

function fixerFor(findingId: string): Fixer | null {
  if (FIXERS[findingId]) return FIXERS[findingId];

  // The analyzer emits one finding per exposed env file, keyed by filename.
  if (findingId.startsWith('security-env-exposed-')) {
    const envFile = findingId.slice('security-env-exposed-'.length);
    // The audit raised this after reading the file, so it is committed and its
    // contents are already published wherever the repository is.
    if (envFile) return ignoreEntryFixer(envFile, { label: envFile, secret: true });
  }

  return null;
}

/** Whether a finding has a fixer at all — before any precondition is checked. */
export function hasFixer(findingId: string): boolean {
  return fixerFor(findingId) !== null;
}

/**
 * Computes every edit that can be made safely, and says why the rest were left.
 *
 * Three outcomes, kept apart because they mean different things. A refusal is a
 * judgement about the repository — a precondition genuinely does not hold, and
 * the reader can act on the reason. An unavailable is the absence of a
 * judgement: the file could not be read, so nothing was concluded. Reporting a
 * dropped connection as "refused" would state an opinion the fixer never
 * formed, which is the one thing this tool must not do.
 */
export async function planFixes(
  findings: LocalAuditFinding[],
  source: ProjectSource,
): Promise<PatchPlan> {
  const copy = new WorkingCopy(source);
  const applied: AppliedFix[] = [];
  const refused: RefusedFix[] = [];
  const unavailable: UnavailableFix[] = [];

  for (const finding of findings) {
    const fixer = fixerFor(finding.id);

    if (!fixer) {
      refused.push({
        findingId: finding.id,
        reason: NEEDS_A_DECISION[finding.id] ?? 'No automatic fix is defined for this finding.',
      });
      continue;
    }

    try {
      const outcome = await fixer(finding, copy);
      if (outcome.ok) {
        applied.push({ findingId: finding.id, filePath: outcome.filePath, rationale: outcome.rationale });
      } else {
        refused.push({ findingId: finding.id, reason: outcome.reason });
      }
    } catch (error) {
      unavailable.push({
        findingId: finding.id,
        reason: `The files needed to judge this could not be read, so nothing was concluded: ${(error as Error).message}`,
      });
    }
  }

  return { files: copy.toPatches(), applied, refused, unavailable };
}

/* ------------------------------------------------------------------ *
 * Pull request body
 * ------------------------------------------------------------------ */

/** Writes the pull request description: what changed, why, and what was not touched. */
export function describePlan(plan: PatchPlan, findings: LocalAuditFinding[]): string {
  const titleOf = (id: string) => findings.find((finding) => finding.id === id)?.title ?? id;
  const lines: string[] = [];

  if (plan.applied.length === 0) {
    lines.push('Sentinel could not compute a safe edit for any of these findings.', '');
  } else {
    lines.push(
      `Sentinel applied ${plan.applied.length} fix${plan.applied.length === 1 ? '' : 'es'} across ` +
        `${plan.files.length} file${plan.files.length === 1 ? '' : 's'}. Every change below was computed ` +
        'from the file it edits.',
      '',
      '## Changed',
      '',
    );
    for (const fix of plan.applied) {
      lines.push(`- **${titleOf(fix.findingId)}** — \`${fix.filePath}\`. ${fix.rationale}`);
    }
    lines.push('');
  }

  if (plan.refused.length > 0) {
    lines.push('## Left for you', '');
    for (const refusal of plan.refused) {
      lines.push(`- **${titleOf(refusal.findingId)}** — ${refusal.reason}`);
    }
    lines.push('');
  }

  if (plan.unavailable.length > 0) {
    lines.push('## Not measured', '');
    for (const item of plan.unavailable) {
      lines.push(`- **${titleOf(item.findingId)}** — ${item.reason}`);
    }
    lines.push('');
  }

  if (plan.files.length > 0) {
    lines.push('## Diff', '');
    for (const file of plan.files) {
      lines.push('```diff', file.diff, '```', '');
    }
  }

  lines.push(
    '---',
    '',
    'Opened by the Sentinel audit agent. It edits only the files named above, and refuses any',
    'fix whose precondition it could not confirm in this repository.',
  );

  return lines.join('\n');
}
