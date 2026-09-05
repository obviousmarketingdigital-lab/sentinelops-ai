#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { auditProject, type LocalAuditReport } from '../lib/local-project-analyzer';
import {
  createFileSystemSource,
  createGitHubSource,
  type ProjectSource,
} from '../lib/project-source';
import { hasFixer, planFixes } from '../lib/fix-engine';
import { performSecurityScan } from '../lib/security-scanner';

/**
 * Sentinel as a tool a coding agent can call.
 *
 * The hosted endpoints refuse private repositories, because a server lending
 * its own token would hand a caller files they cannot read themselves. This
 * process has no such problem: it runs on the developer's machine, reads the
 * working tree directly, and never sends the source anywhere. Private
 * repositories are the ordinary case here, not the exception.
 *
 * What it offers an agent is the thing an agent cannot get by reading the repo
 * itself: an answer that is the same every time, carries the exact text it was
 * derived from, and says plainly when it does not know. An agent that acts on
 * an invented finding wastes a whole session.
 */

const CHECKS = [
  ['Docker', 'multi-stage build, slim and pinned base image, non-root USER, npm ci over npm install, ADD over the network, COPY . . without a .dockerignore'],
  ['TypeScript', 'whether compilerOptions.strict is enabled'],
  ['Dependencies', 'a committed lockfile, a Node version pinned via engines, dependencies resolved from git or a URL'],
  ['Security', '.env files and node_modules not covered by .gitignore'],
  ['Advisories', 'installed versions from package-lock.json against the public npm advisory database'],
] as const;

const TARGET = {
  path: z
    .string()
    .optional()
    .describe('Directory to audit. Defaults to the current working directory. Use this for private repositories: the files are read locally and never leave the machine.'),
  repo: z
    .string()
    .optional()
    .describe('A public GitHub repository as "owner/repo", read through the contents API instead of the local disk.'),
  ref: z.string().optional().describe('Branch, tag or commit for `repo`. Defaults to the default branch.'),
};

function sourceFor(args: { path?: string; repo?: string; ref?: string }): ProjectSource {
  if (args.repo) {
    const [owner, repo] = args.repo.split('/');
    if (!owner || !repo) {
      throw new Error(`"${args.repo}" is not in owner/repo form.`);
    }
    // The token is the caller's own, from their environment, so a private
    // repository they can read is one this tool can read.
    return createGitHubSource({ owner, repo, ref: args.ref, token: process.env.GITHUB_TOKEN });
  }
  return createFileSystemSource(args.path ?? process.cwd());
}

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

/** Renders what was read and what could not be, before any finding is listed. */
function provenance(report: LocalAuditReport): string[] {
  const lines = [`Source: ${report.origin}`, `Files read: ${report.filesInspected.join(', ') || 'none'}`];
  if (report.filesMissing.length > 0) lines.push(`Absent: ${report.filesMissing.join(', ')}`);
  if (report.filesUnreadable.length > 0) {
    lines.push(
      `Present but unparseable, so nothing was concluded about them: ${report.filesUnreadable.join(', ')}`,
    );
  }
  return lines;
}

const server = new McpServer(
  { name: 'sentinel', version: '0.1.0' },
  {
    instructions:
      'Sentinel reports only what it read out of a file, and refuses by name what it cannot prove. ' +
      'Call audit_repository before changing build or dependency configuration, and plan_fixes to get ' +
      'a patch computed from the current file rather than written from a template. Treat a "refused" ' +
      'or "not measured" result as a fact about the repository, not as an error to work around.',
  },
);

server.registerTool(
  'audit_repository',
  {
    title: 'Audit a repository',
    description:
      'Runs static checks over a project and reports each finding with the exact text that produced it. ' +
      'Every claim traces back to a line in a real file; nothing is inferred. Reports no score — a count ' +
      'of findings and the evidence for each. Use it before editing a Dockerfile, tsconfig or package.json ' +
      'so the change is based on what the files actually say.',
    inputSchema: TARGET,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    const report = await auditProject(sourceFor(args));

    if (!report.analyzable) {
      return text(
        [`Nothing was measured for ${report.origin}.`, '', ...report.notes.map((n) => `- ${n}`)].join('\n'),
      );
    }

    const lines = [
      ...provenance(report),
      `Findings: ${report.findingsCount}`,
      '',
    ];

    if (report.findings.length === 0) {
      lines.push('Every check that could run passed.');
    } else {
      for (const finding of report.findings) {
        lines.push(
          `## ${finding.title}`,
          `- id: ${finding.id}`,
          `- impact: ${finding.impact} (${finding.category})`,
          `- read from: ${finding.source}`,
          `- observed: ${finding.evidence}`,
          `- patch available: ${hasFixer(finding.id) ? 'yes, via plan_fixes' : 'no, this one needs a person'}`,
          '',
          finding.description,
          '',
          `Suggested: ${finding.recommendation}`,
          '',
        );
      }
    }

    if (report.notes.length > 0) lines.push('', ...report.notes.map((n) => `Note: ${n}`));

    return text(lines.join('\n'));
  },
);

server.registerTool(
  'plan_fixes',
  {
    title: 'Compute the patch',
    description:
      'Returns a unified diff for the findings it can fix, computed from the files as they are now — never ' +
      'a replacement file written from a template. Writes nothing: apply the diff yourself if you agree ' +
      'with it. Findings it will not touch come back as "refused" with the precondition that failed ' +
      '(npm ci without a committed lockfile, USER node on an image with no node user), or as "not measured" ' +
      'when a file could not be read at all. A refusal is a result, not a failure.',
    inputSchema: {
      ...TARGET,
      findingIds: z
        .array(z.string())
        .optional()
        .describe('Limit the plan to these finding ids. Defaults to every finding the audit produced.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    const source = sourceFor(args);
    const report = await auditProject(source);

    if (!report.analyzable) {
      return text([`Nothing was measured for ${report.origin}.`, ...report.notes].join('\n'));
    }

    const wanted = args.findingIds
      ? report.findings.filter((f) => args.findingIds!.includes(f.id))
      : report.findings;

    if (wanted.length === 0) {
      return text('No findings to plan against.');
    }

    const plan = await planFixes(wanted, source);
    const title = (id: string) => report.findings.find((f) => f.id === id)?.title ?? id;
    const lines = [`Source: ${report.origin}`, `Findings considered: ${wanted.length}`, ''];

    if (plan.applied.length > 0) {
      lines.push(`## Patched (${plan.applied.length})`, '');
      for (const fix of plan.applied) {
        lines.push(`- ${title(fix.findingId)} — ${fix.filePath}. ${fix.rationale}`);
      }
      lines.push('');
    }

    if (plan.refused.length > 0) {
      lines.push(`## Refused (${plan.refused.length})`, '');
      for (const item of plan.refused) lines.push(`- ${title(item.findingId)} — ${item.reason}`);
      lines.push('');
    }

    if (plan.unavailable.length > 0) {
      lines.push(`## Not measured (${plan.unavailable.length})`, '');
      for (const item of plan.unavailable) lines.push(`- ${title(item.findingId)} — ${item.reason}`);
      lines.push('');
    }

    if (plan.files.length === 0) {
      lines.push('No edit could be computed safely. Nothing above is a patch you can apply.');
      return text(lines.join('\n'));
    }

    lines.push('## Diff', '', 'Apply these yourself; this tool wrote nothing.', '');
    for (const file of plan.files) {
      lines.push(`### ${file.filePath}${file.original === null ? ' (new file)' : ''}`, '', '```diff', file.diff, '```', '');
    }

    return text(lines.join('\n'));
  },
);

server.registerTool(
  'scan_advisories',
  {
    title: 'Check dependencies against npm advisories',
    description:
      'Reads installed versions out of package-lock.json and queries the public npm advisory database. ' +
      'Reports the package, the installed version and the vulnerable range for each hit. Says it could ' +
      'not scan rather than reporting zero when the lockfile is missing or the query failed.',
    inputSchema: TARGET,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    const scan = await performSecurityScan(sourceFor(args));

    if (!scan.ok) return text(`Not scanned: ${scan.error}`);

    if (scan.vulnerabilities.length === 0) {
      return text(`${scan.packagesScanned} packages checked. No known advisories for this dependency tree.`);
    }

    const lines = [`${scan.packagesScanned} packages checked. ${scan.vulnerabilities.length} advisory hit(s):`, ''];
    for (const vuln of scan.vulnerabilities) {
      lines.push(
        `- ${vuln.severity} · ${vuln.packageName} ${vuln.installedVersion}${vuln.cveId ? ` (${vuln.cveId})` : ''}`,
        `  ${vuln.title}`,
        `  Vulnerable range: ${vuln.vulnerableVersions}`,
      );
    }
    return text(lines.join('\n'));
  },
);

server.registerTool(
  'list_checks',
  {
    title: 'What Sentinel checks',
    description:
      'The complete list of what this tool inspects. Call it to find out whether a question is in scope ' +
      'before relying on an audit to answer it — Sentinel is deliberately narrow, and silence about an ' +
      'area means it was never examined, not that it passed.',
    annotations: { readOnlyHint: true },
  },
  async () =>
    text(
      [
        'Sentinel reads a handful of files and checks only these:',
        '',
        ...CHECKS.map(([area, what]) => `- ${area}: ${what}`),
        '',
        'Anything outside this list is not examined. It reports no score: findings are counted, never graded.',
      ].join('\n'),
    ),
);

/**
 * stdout is the protocol channel, so nothing may be printed to it. A failure
 * has to reach stderr and set an exit code, or the client sees a transport that
 * simply stopped answering.
 */
async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(`sentinel-mcp failed to start: ${(error as Error).message}\n`);
  process.exit(1);
});
