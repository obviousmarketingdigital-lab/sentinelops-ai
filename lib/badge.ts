import type { LocalAuditReport } from './local-project-analyzer';
import { hasFixer } from './fix-engine';

const LABEL_WIDTH = 65;
const CHAR_WIDTH = 6.6;
const PADDING = 14;

export const BADGE_COLORS = {
  clean: '#7c9c88',
  findings: '#c8763e',
  unknown: '#5b666e',
} as const;

export interface BadgeState {
  label: string;
  color: string;
}

/**
 * A badge sits in someone else's README, so every word on it must be a fact.
 *
 * It used to read `78/100`, a number computed as 100 minus a penalty per
 * finding. Nothing about that traced to a line in a file, and it invited the
 * only question that mattered — compared to what — with no answer. A count
 * answers for itself: three findings are three findings, and two of them have
 * a patch this tool can compute today.
 *
 * The colour grades nothing either. Green means the checks found nothing,
 * amber means they found something, grey means they could not run. A project
 * the audit cannot analyse never borrows a passing colour.
 */
export function badgeStateFor(report: LocalAuditReport): BadgeState {
  if (!report.analyzable) {
    return { label: 'n/a', color: BADGE_COLORS.unknown };
  }

  const total = report.findings.length;
  if (total === 0) {
    return { label: 'no findings', color: BADGE_COLORS.clean };
  }

  const patchable = report.findings.filter((finding) => hasFixer(finding.id)).length;
  const noun = total === 1 ? 'finding' : 'findings';

  return {
    label: patchable > 0 ? `${total} ${noun} · ${patchable} patchable` : `${total} ${noun}`,
    color: BADGE_COLORS.findings,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders a shields-style badge sized to its label. */
export function renderBadge({ label, color }: BadgeState): string {
  const safe = escapeXml(label);
  const valueWidth = Math.max(46, Math.round(safe.length * CHAR_WIDTH + PADDING));
  const total = LABEL_WIDTH + valueWidth;
  const valueCenter = LABEL_WIDTH + valueWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="Sentinel: ${safe}">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="${total}" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <rect width="${LABEL_WIDTH}" height="20" fill="#12161a"/>
    <rect x="${LABEL_WIDTH}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${total}" height="20" fill="url(#b)"/>
  </g>
  <g text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="32.5" y="15" fill="#010101" fill-opacity=".3">sentinel</text>
    <text x="32.5" y="14" fill="#e6eaed">sentinel</text>
    <text x="${valueCenter}" y="15" fill="#010101" fill-opacity=".3">${safe}</text>
    <text x="${valueCenter}" y="14" fill="#ffffff">${safe}</text>
  </g>
</svg>`;
}
