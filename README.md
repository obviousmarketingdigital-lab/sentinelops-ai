# Sentinel

> A static audit agent for Node projects. It reads the repository it is pointed at,
> reports what it actually finds, and computes the patch that fixes what it can
> prove — refusing, by name and with a reason, everything it cannot.

[![Sentinel](https://sentinelops-ai-fuzj.onrender.com/api/sentinel/badge?repo=obviousmarketingdigital-lab/sentinelops-ai)](https://sentinelops-ai-fuzj.onrender.com/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.3-black?style=flat&logo=next.js)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Sentinel inspects a project's `package.json`, `Dockerfile`, `tsconfig.json`,
lockfile and `.gitignore`, and cross-checks the installed dependency tree
against the public npm advisory database. It reads from a `ProjectSource`, so
the same audit runs against a directory on disk or any public GitHub
repository — type `owner/repo` in the dashboard. Every finding carries the exact
text that produced it, so any claim on the dashboard can be traced back to a
line in a file.

---

## What is measured, and what is not

This matters more than a feature list, so it comes first.

**Measured against your files:**

| Area | Check |
| --- | --- |
| Docker | multi-stage build, slim base image, pinned base tag, non-root `USER`, `npm ci` vs `npm install`, `ADD` over the network, `COPY . .` without a `.dockerignore` |
| TypeScript | whether `compilerOptions.strict` is enabled |
| Dependencies | a lockfile is committed (npm, pnpm, yarn or bun), Node version pinned via `engines`, dependencies resolved from git or a URL |
| Security | `.env` files and `node_modules` not covered by `.gitignore` |
| Advisories | installed versions from `package-lock.json` queried against the npm advisory database |

The health score is `100` minus a penalty for each finding — 15 for high impact,
8 for medium, 3 for low. When the source tree is not reachable, for example
inside a standalone container that does not ship its own sources, the audit
reports that it could not analyze anything rather than returning a number.

---

## The patch

Earlier versions of this file drew a boundary: Sentinel would describe a change
rather than make one, *"until the agent can compute a diff from the file it is
editing."* It can now, so it does.

The rule that produced that boundary has not moved. Generating a replacement
`package.json` or `Dockerfile` from a template proposes content that was never
derived from the real file, and merging it would destroy the original. A
line-level edit applied to text the fixer has just read is derived from the real
file, which is why it is allowed and a template still is not.

`POST /api/sentinel/preview-fix` returns the diff and writes nothing. Seven
findings have a fixer:

| Finding | The edit |
| --- | --- |
| `docker-root-user` | inserts `USER node` before the final `CMD` |
| `docker-npm-install` | rewrites `npm install` to `npm ci` |
| `docker-unpinned-base` | pins the tag to the major in `engines.node` |
| `docker-copy-all` | writes `.dockerignore` from this repository's `.gitignore` |
| `ts-strict-off` | sets `"strict": true`, keeping comments and formatting |
| `deps-no-engines` | declares the version the Dockerfile already builds on |
| `gitignore-node-modules`, `security-env-exposed-*` | appends the entry |

### Three outcomes, kept apart

**Applied** — the edit was computed, and the rationale names what changed.

**Refused** — a precondition in the repository does not hold, and the reason is
specific enough to act on. `npm ci` is refused when no lockfile is committed,
because it exits non-zero without one and the "fix" would break the next build.
`USER node` is refused on a base image that is not an official node image,
because a container that cannot start is worse than the finding it closed.
Pinning is refused when the repository declares no version to copy, because
choosing one would be a guess.

**Not measured** — the files needed to judge could not be read. A dropped
connection is never reported as a refusal: that would state an opinion the fixer
never formed.

Findings whose remedy is a design decision — splitting build stages, choosing a
base image, replacing a network `ADD` with a checksummed download — are refused
by name, with the reason, rather than attempted.

With `GITHUB_TOKEN`, `GITHUB_OWNER` and `GITHUB_REPO` configured,
`POST /api/sentinel/local-fix` opens a pull request carrying that patch; pass
`{ "all": true }` for every fixable finding in one branch. Without those
variables the endpoint returns `412` and says it is not configured. It never
reports a pull request that was not opened.

---

## Quick start

```bash
npm install
npm run dev -- -p 3009
```

Then open <http://localhost:3009/sentinel>.

For real pull requests, create `.env.local`:

```env
GITHUB_TOKEN=ghp_your_personal_access_token_here
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-repository
```

`GITHUB_WEBHOOK_SECRET` is required for the webhook endpoint to accept anything;
without it every delivery is rejected. `STRIPE_SECRET_KEY` enables checkout, and
without it the endpoint reports that billing is unavailable rather than
simulating a session.

`SENTINEL_DATA_DIR` points the applied-fix history at a mounted volume. Without
it the history lives on the container filesystem and is lost on every restart.

---

## Badge

Any public repository can display its own score:

```markdown
![Sentinel](https://sentinelops-ai-fuzj.onrender.com/api/sentinel/badge?repo=OWNER/REPO)
```

The badge always answers with an image, because a broken image in a README
says nothing. When a repository cannot be reached it reads `not found`, and a
project the audit cannot analyse reads `n/a` in grey — never a passing colour
for a score that was not measured. Results are cached for five minutes.

---

## Endpoints

| Route | Returns |
| --- | --- |
| `GET /api/health` | process status, uptime and the port in use |
| `GET /api/sentinel/local-audit` | the static audit of the working directory |
| `POST /api/sentinel/audit-repo` | audits a GitHub repository: `{ owner, repo, ref? }` |
| `GET /api/sentinel/security` | npm advisories for the installed tree |
| `GET /api/sentinel/badge` | SVG badge for this project, or `?repo=OWNER/REPO` |
| `POST /api/sentinel/preview-fix` | the diff that would fix a project, written nowhere: `{ local: true }` or `{ owner, repo }` |
| `POST /api/sentinel/local-fix` | opens a pull request carrying the patch: `{ id }` or `{ all: true }` |
| `POST /api/webhooks/github` | rejects deliveries without a valid `x-hub-signature-256` |
| `POST /api/revenue/checkout` | Stripe checkout; returns 503 when billing is unconfigured |

---

## Tests

```bash
npm test
```

The audit is covered by regression tests, including one for a parser bug that
made Sentinel report `strict` as disabled on a project where it was enabled: a
`"@/*"` path value contains the characters that open a block comment, and the
original regex-based parser treated it as one.

---

## License

MIT. See `LICENSE`.
