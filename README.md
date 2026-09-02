# Sentinel

> A static audit agent for Node projects. It reads the repository it is pointed at,
> reports what it actually finds, and can open a pull request describing each finding.

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
| Docker | multi-stage build, slim base image, non-root `USER`, `npm ci` vs `npm install` |
| TypeScript | whether `compilerOptions.strict` is enabled |
| Dependencies | a lockfile is committed (npm, pnpm, yarn or bun), Node version pinned via `engines` |
| Security | `.env` files not covered by `.gitignore` |
| Advisories | installed versions from `package-lock.json` queried against the npm advisory database |

The health score is `100` minus a penalty for each finding — 15 for high impact,
8 for medium, 3 for low. When the source tree is not reachable, for example
inside a standalone container that does not ship its own sources, the audit
reports that it could not analyze anything rather than returning a number.

**Sample data, clearly labelled as such in the UI:**

- **Cloud AWS** — illustrative cost anomalies. No AWS account is connected, and
  the project has no AWS SDK dependency. Nothing on that tab was measured.
- **Fleet** — a fixed list of services held in memory. No service is probed over
  the network.
- **SaaS Org** — an example organization. There is no authentication, no tenant
  database and no billing.

These tabs exist to show the shape of the product. Each one renders a banner
saying the data was not measured.

---

## Pull requests

With `GITHUB_TOKEN`, `GITHUB_OWNER` and `GITHUB_REPO` configured, the
**Open pull request** button creates a branch and opens a PR containing a report
of the finding under `sentinel-reports/`.

It writes a report rather than editing your source files. Generating a
replacement `package.json` or `Dockerfile` from a template means proposing
content that was never derived from the real file, and merging it would destroy
the original. Until the agent can compute a diff from the file it is editing,
describing the change for a human to apply is the honest boundary.

Without those variables the endpoint returns `412` and says it is not
configured. It never reports a pull request that was not opened.

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
| `POST /api/sentinel/local-fix` | opens a pull request for one finding |
| `GET /api/sentinel/analyze` | sample cloud anomalies (`mode: "sample"`) |
| `POST /api/sentinel/fix` | a remediation plan; `executed` is always `false` |
| `GET /api/sentinel/microservices` | sample fleet (`mode: "sample"`) |
| `GET /api/sentinel/saas` | sample organization (`mode: "sample"`) |
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
