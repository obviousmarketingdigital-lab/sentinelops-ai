import type { LocalAuditFinding } from './local-project-analyzer';

export interface FindingReport {
  filePath: string;
  fileContent: string;
  body: string;
}

/**
 * Builds the artifact the agent proposes for a finding.
 *
 * It deliberately writes a report under sentinel-reports/ instead of rewriting
 * source files. Generating a replacement package.json or Dockerfile from a
 * template means proposing content that was never derived from the real file,
 * and merging such a patch would destroy the original. Describing the change
 * for a human to apply is the honest boundary until the agent can produce a
 * diff computed from the file it is editing.
 */
export function buildFindingReport(finding: LocalAuditFinding): FindingReport {
  const body = [
    `### ${finding.title}`,
    '',
    `- **Category:** ${finding.category}`,
    `- **Impact:** ${finding.impact}`,
    `- **Detected in:** \`${finding.source}\``,
    `- **Observed:** \`${finding.evidence}\``,
    '',
    finding.description,
    '',
    `**Recommendation:** ${finding.recommendation}`,
    '',
    '_Opened by the Sentinel audit agent. It reports what it measured and does not edit source files on its own._',
  ].join('\n');

  return {
    filePath: `sentinel-reports/${finding.id}.md`,
    fileContent: `# Sentinel finding: ${finding.id}\n\n${body}\n`,
    body,
  };
}
