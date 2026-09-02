import type { LocalAuditReport } from './local-project-analyzer';

const LABEL_WIDTH = 65;
const CHAR_WIDTH = 6.6;
const PADDING = 14;

export const BADGE_COLORS = {
  good: '#7c9c88',
  fair: '#c8763e',
  poor: '#a8443a',
  unknown: '#5b666e',
} as const;

export interface BadgeState {
  label: string;
  color: string;
}

/**
 * A badge sits in someone else's README, so it must never assert a score the
 * audit did not produce. An unmeasurable project reads "n/a" in grey rather
 * than borrowing the colour of a passing grade.
 */
export function badgeStateFor(report: LocalAuditReport): BadgeState {
  if (!report.analyzable || report.healthScore === null) {
    return { label: 'n/a', color: BADGE_COLORS.unknown };
  }

  const score = report.healthScore;
  const color =
    score > 80 ? BADGE_COLORS.good : score > 60 ? BADGE_COLORS.fair : BADGE_COLORS.poor;

  return { label: `${score}/100`, color };
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
