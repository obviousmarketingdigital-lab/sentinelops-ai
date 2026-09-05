import { NextResponse } from 'next/server';
import { auditProject } from '@/lib/local-project-analyzer';
import {
  createFileSystemSource,
  createGitHubSource,
  inspectRepositoryVisibility,
  type ProjectSource,
} from '@/lib/project-source';
import { callerKey, takeRateLimitSlot } from '@/lib/audit-cache';
import { planFixes } from '@/lib/fix-engine';
import { isSafeRef, isSafeSegment } from '../audit-repo/route';

export const dynamic = 'force-dynamic';

/**
 * Shows the diff that would fix a project, without writing anything.
 *
 * Nothing is committed and no branch is created: the fixers run against files
 * read through a ProjectSource and return the patch as text. It is the same
 * plan the pull request would carry, which is the point — what you see here is
 * what would land.
 *
 * Pass `{ local: true }` for the directory the server runs in, or
 * `{ owner, repo }` for a public repository. The engine does not care which,
 * so the page can offer one flow for both.
 */
export async function POST(request: Request) {
  try {
    const { owner, repo, ref, local } = (await request.json()) as {
      owner?: string;
      repo?: string;
      ref?: string;
      local?: boolean;
    };

    let source: ProjectSource;

    if (local) {
      // Reading the server's own directory costs no GitHub quota, so it is not
      // metered against the caller's rate limit.
      source = createFileSystemSource();
    } else {
      if (!takeRateLimitSlot(callerKey(request))) {
        return NextResponse.json(
          { success: false, error: 'Too many audits from this address. Try again in a minute.' },
          { status: 429 },
        );
      }

      if (!owner || !repo || !isSafeSegment(owner) || !isSafeSegment(repo)) {
        return NextResponse.json(
          { success: false, error: 'Provide a valid owner and repo.' },
          { status: 400 },
        );
      }

      if (ref && !isSafeRef(ref)) {
        return NextResponse.json({ success: false, error: 'Invalid ref.' }, { status: 400 });
      }

      const token = process.env.GITHUB_TOKEN;

      // Same rule as the audit: the server's token never reads a repository the
      // caller could not read themselves.
      const visibility = await inspectRepositoryVisibility(owner, repo, token);

      if (!visibility.exists || !visibility.isPublic) {
        return NextResponse.json(
          {
            success: false,
            error: `${owner}/${repo} was not found as a public repository. To preview fixes on a private repository, run Sentinel inside your own CI, where the files never leave your infrastructure.`,
          },
          { status: 404 },
        );
      }

      source = createGitHubSource({ owner, repo, ref, token });
    }

    const report = await auditProject(source);

    if (!report.analyzable) {
      return NextResponse.json({
        success: true,
        analyzable: false,
        notes: report.notes,
        files: [],
        applied: [],
        refused: [],
        unavailable: [],
      });
    }

    const plan = await planFixes(report.findings, source);

    return NextResponse.json(
      {
        success: true,
        analyzable: true,
        origin: report.origin,
        healthScore: report.healthScore,
        findingsCount: report.findingsCount,
        // The score this repository would carry once every computable fix lands.
        projectedScore: projectScore(report.healthScore, report.findings, plan.applied),
        files: plan.files.map((file) => ({
          filePath: file.filePath,
          created: file.original === null,
          diff: file.diff,
          findingIds: file.findingIds,
        })),
        applied: plan.applied,
        refused: plan.refused,
        unavailable: plan.unavailable,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 502 },
    );
  }
}

const IMPACT_PENALTY = { High: 15, Medium: 8, Low: 3 } as const;

/**
 * Adds back the penalty of every finding the plan actually closes.
 *
 * It recomputes from the same penalty table the audit uses rather than
 * estimating, so the projected number is the number the next audit will report.
 */
function projectScore(
  current: number | null,
  findings: Array<{ id: string; impact: keyof typeof IMPACT_PENALTY }>,
  applied: Array<{ findingId: string }>,
): number | null {
  if (current === null) return null;

  const recovered = applied.reduce((total, fix) => {
    const finding = findings.find((item) => item.id === fix.findingId);
    return finding ? total + IMPACT_PENALTY[finding.impact] : total;
  }, 0);

  return Math.min(100, current + recovered);
}
