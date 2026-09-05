/**
 * Whether a .gitignore covers a specific path.
 *
 * This exists because two places used to answer the question differently. The
 * audit tested `/^\s*\.env/m` — any line starting with ".env" — which a
 * `.envrc` entry satisfies, so a repository with direnv configured and a real
 * `.env` committed passed the secrets check. The fixer meanwhile compared
 * entries exactly, so `/node_modules` (what every Next and CRA template writes)
 * read as "not ignored". One was too loose in the direction that hides a
 * finding, the other too strict in the direction that invents one.
 *
 * Gitignore's full grammar is larger than this: nothing here understands
 * directory-scoped rules, `**` in the middle of a pattern, or character
 * classes. That is deliberate. When a rule is not one of the shapes below, the
 * answer is "not covered", which produces a finding rather than suppressing
 * one — the safe direction for a check about secrets.
 */

/** Turns a gitignore entry with `*` into an anchored regular expression. */
function globToRegExp(entry: string): RegExp {
  const source = entry
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${source}$`);
}

function normalize(entry: string): string {
  return entry
    .replace(/^\*\*\//, '')
    .replace(/^\//, '')
    .replace(/\/$/, '');
}

function covers(entry: string, target: string): boolean {
  const rule = normalize(entry);
  if (rule === '') return false;
  if (rule === target) return true;
  // A rule naming a directory covers everything beneath it.
  if (target.startsWith(`${rule}/`)) return true;
  return rule.includes('*') && globToRegExp(rule).test(target);
}

/**
 * True when `target` would be ignored.
 *
 * Later rules win in gitignore, so the file is read in order and the last rule
 * that matches decides — which is what makes `!keep.me` after a broad pattern
 * mean the file is tracked after all.
 */
export function ignoresPath(gitignore: string | null | undefined, target: string): boolean {
  if (!gitignore) return false;

  let ignored = false;

  for (const raw of gitignore.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    const negated = line.startsWith('!');
    const entry = negated ? line.slice(1) : line;

    if (covers(entry, target)) ignored = !negated;
  }

  return ignored;
}
