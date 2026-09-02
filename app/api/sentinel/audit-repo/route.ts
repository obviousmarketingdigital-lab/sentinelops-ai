import { NextResponse } from 'next/server';
import { auditProject, type LocalAuditReport } from '@/lib/local-project-analyzer';
import { performSecurityScan, type SecurityScanResult } from '@/lib/security-scanner';
import { createGitHubSource, inspectRepositoryVisibility } from '@/lib/project-source';
import { callerKey, readCache, takeRateLimitSlot, writeCache } from '@/lib/audit-cache';

export const dynamic = 'force-dynamic';

/**
 * Owner and repo become path segments in a GitHub API URL. Dots are legal in
 * repository names but "." and ".." are not names, and encodeURIComponent does
 * not escape them, so they would traverse the API path.
 */
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const REF = /^[A-Za-z0-9._\/-]+$/;

export function isSafeSegment(value: string): boolean {
  return SEGMENT.test(value) && value !== '.' && value !== '..';
}

export function isSafeRef(value: string): boolean {
  return REF.test(value) && !value.split('/').some((part) => part === '.' || part === '..');
}

interface AuditResponse {
  report: LocalAuditReport;
  scan: SecurityScanResult;
}

export async function POST(request: Request) {
  if (!takeRateLimitSlot(callerKey(request))) {
    return NextResponse.json(
      { success: false, error: 'Too many audits from this address. Try again in a minute.' },
      { status: 429 },
    );
  }

  try {
    const { owner, repo, ref } = (await request.json()) as {
      owner?: string;
      repo?: string;
      ref?: string;
    };

    if (!owner || !repo || !isSafeSegment(owner) || !isSafeSegment(repo)) {
      return NextResponse.json(
        { success: false, error: 'Provide a valid owner and repo.' },
        { status: 400 },
      );
    }

    if (ref && !isSafeRef(ref)) {
      return NextResponse.json({ success: false, error: 'Invalid ref.' }, { status: 400 });
    }

    const cacheKey = `audit:${owner}/${repo}@${ref ?? 'default'}`;
    const cached = readCache<AuditResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(
        { success: true, cached: true, ...cached },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const token = process.env.GITHUB_TOKEN;

    // Public repositories only. Reading a private repository with the server's
    // token would hand the caller data they have no access to.
    const visibility = await inspectRepositoryVisibility(owner, repo, token);

    if (!visibility.exists || !visibility.isPublic) {
      return NextResponse.json(
        {
          success: false,
          error: `${owner}/${repo} was not found as a public repository. This endpoint audits public repositories only.`,
        },
        { status: 404 },
      );
    }

    const source = createGitHubSource({ owner, repo, ref, token });
    const report = await auditProject(source);
    const scan = await performSecurityScan(source);

    writeCache<AuditResponse>(cacheKey, { report, scan });

    return NextResponse.json(
      { success: true, cached: false, report, scan },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 502 },
    );
  }
}
