import { NextResponse } from 'next/server';
import { auditLocalProject } from '@/lib/local-project-analyzer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await auditLocalProject();
  const label = report.healthScore === null ? 'n/a' : `${report.healthScore}/100`;
  const color =
    report.healthScore === null
      ? '#5b666e'
      : report.healthScore > 80
        ? '#7c9c88'
        : report.healthScore > 60
          ? '#c8763e'
          : '#a8443a';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="20" role="img" aria-label="Sentinel: ${label}">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="140" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <rect width="65" height="20" fill="#12161a"/>
    <rect x="65" width="75" height="20" fill="${color}"/>
    <rect width="140" height="20" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="32.5" y="15" fill="#010101" fill-opacity=".3">sentinel</text>
    <text x="32.5" y="14" fill="#e6eaed">sentinel</text>
    <text x="102.5" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="102.5" y="14" fill="#ffffff">${label}</text>
  </g>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache',
    },
  });
}
