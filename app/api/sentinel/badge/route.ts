import { NextResponse } from 'next/server';
import { auditLocalProject } from '@/lib/local-project-analyzer';

export async function GET() {
  const report = auditLocalProject();
  const score = report.healthScore;
  const color = score > 80 ? '#10b981' : score > 60 ? '#f59e0b' : '#ef4444';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="20" role="img" aria-label="Sentinel Security: ${score}/100">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="140" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <rect width="65" height="20" fill="#1e293b"/>
    <rect x="65" width="75" height="20" fill="${color}"/>
    <rect width="140" height="20" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="32.5" y="15" fill="#010101" fill-opacity=".3">sentinel</text>
    <text x="32.5" y="14" fill="#e2e8f0">sentinel</text>
    <text x="102.5" y="15" fill="#010101" fill-opacity=".3">${score}/100</text>
    <text x="102.5" y="14" fill="#ffffff">${score}/100</text>
  </g>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache',
    },
  });
}
