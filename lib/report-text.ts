import type { LocalAuditFinding, LocalAuditReport } from './local-project-analyzer';
import type { SecurityScanResult } from './security-scanner';

function findingBlock(finding: LocalAuditFinding, index: number): string {
  return [
    `### ${index}. ${finding.title}`,
    `- Impact: ${finding.impact}`,
    `- Category: ${finding.category}`,
    `- File: \`${finding.source}\``,
    `- Observed: \`${finding.evidence}\``,
    '',
    finding.description,
    '',
    `Suggested fix: ${finding.recommendation}`,
  ].join('\n');
}

/**
 * Formats a report as a prompt for a coding agent.
 *
 * The closing instruction tells the agent to confirm each observation before
 * editing. That is not politeness: a static check can be wrong about a project
 * it has only partly read, and an agent that edits on trust turns one bad
 * finding into a bad commit.
 */
export function toAgentPrompt(report: LocalAuditReport, scan?: SecurityScanResult | null): string {
  const lines: string[] = [`# Sentinel audit — ${report.origin}`, ''];

  if (!report.analyzable) {
    lines.push('The audit could not analyze this project.', '');
    lines.push(...report.notes.map((note) => `- ${note}`));
    return lines.join('\n');
  }

  const summary = [
    `${report.findingsCount} finding${report.findingsCount === 1 ? '' : 's'}`,
    `${report.filesInspected.length} file${report.filesInspected.length === 1 ? '' : 's'} read`,
  ];
  lines.push(summary.join(' · '), '');
  lines.push(`Files read: ${report.filesInspected.join(', ')}`, '');

  if (report.findings.length === 0) {
    lines.push('No findings. Every check the audit knows how to run passed.', '');
  } else {
    lines.push('## Findings', '');
    report.findings.forEach((finding, index) => {
      lines.push(findingBlock(finding, index + 1), '');
    });
  }

  const advisories = scan?.ok ? scan.vulnerabilities : [];
  if (advisories.length > 0) {
    lines.push('## Dependency advisories', '');
    for (const vuln of advisories) {
      lines.push(
        `- **${vuln.severity}** ${vuln.packageName} ${vuln.installedVersion} — ${vuln.title}` +
          (vuln.cveId ? ` (${vuln.cveId})` : '') +
          `. Vulnerable range: ${vuln.vulnerableVersions}.`,
      );
    }
    lines.push('');
  } else if (scan && !scan.ok) {
    lines.push('## Dependency advisories', '', `Not scanned: ${scan.error}`, '');
  }

  if (report.filesUnreadable.length > 0) {
    lines.push(
      '## Not measured',
      '',
      `These files were present but could not be parsed, so nothing was concluded about them: ${report.filesUnreadable.join(', ')}.`,
      '',
    );
  }

  lines.push(
    '---',
    '',
    'Please apply these changes. Before editing anything, open the file named in each',
    'finding and confirm the observation still holds — this audit reads a handful of',
    'files and can be wrong about a project it has only partly seen. Skip anything you',
    'cannot confirm, and say which ones you skipped.',
  );

  return lines.join('\n');
}
