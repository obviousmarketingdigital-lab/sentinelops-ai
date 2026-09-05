import { NextResponse } from 'next/server';
import { applyFix, getAppliedFixes } from '@/lib/data-store';
import { GitHubService } from '@/lib/github-service';
import { auditLocalProject, type LocalAuditFinding } from '@/lib/local-project-analyzer';
import { createFileSystemSource } from '@/lib/project-source';
import { describePlan, planFixes } from '@/lib/fix-engine';
import { buildFindingReport } from '@/lib/ai-patcher';

export const dynamic = 'force-dynamic';

export async function GET() {
  const fixes = await getAppliedFixes();
  return NextResponse.json({ success: true, fixes });
}

/**
 * Opens a pull request that edits the project's own files.
 *
 * Pass `{ id }` for one finding or `{ all: true }` for every finding that has a
 * fixer. When no safe edit can be computed the request still produces a pull
 * request, but it carries the written report instead — the same honest fallback
 * the agent has always had, now reached only after trying to patch.
 */
export async function POST(request: Request) {
  try {
    const { id, all } = (await request.json()) as { id?: string; all?: boolean };

    if (!id && !all) {
      return NextResponse.json(
        { success: false, error: 'Pass a finding id, or all: true to fix everything fixable.' },
        { status: 400 },
      );
    }

    const report = await auditLocalProject();

    let targets: LocalAuditFinding[];
    if (all) {
      targets = report.findings;
      if (targets.length === 0) {
        return NextResponse.json(
          { success: false, error: 'The audit found nothing to fix.' },
          { status: 404 },
        );
      }
    } else {
      const finding = report.findings.find((item) => item.id === id);
      if (!finding) {
        return NextResponse.json({ success: false, error: 'Finding not found' }, { status: 404 });
      }
      targets = [finding];
    }

    const github = new GitHubService();
    const repoOwner = process.env.GITHUB_OWNER;
    const repoName = process.env.GITHUB_REPO;

    // No pull request is invented when the integration is not configured. An
    // unconfigured agent reports that it is unconfigured.
    if (!github.hasToken() || !repoOwner || !repoName) {
      return NextResponse.json(
        {
          success: false,
          error:
            'GitHub integration is not configured. Set GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO to let the agent open pull requests.',
        },
        { status: 412 },
      );
    }

    const plan = await planFixes(targets, createFileSystemSource());

    const patchedNothing = plan.files.length === 0;
    const title = all
      ? `[Sentinel] ${plan.applied.length} automated fix${plan.applied.length === 1 ? '' : 'es'}`
      : `[Sentinel] ${targets[0].title}`;

    // Falling back to the report keeps a refused fix useful: the reader still
    // gets the finding and the reason no edit was safe, rather than an error.
    const files = patchedNothing
      ? [
          {
            path: buildFindingReport(targets[0]).filePath,
            content: buildFindingReport(targets[0]).fileContent,
          },
        ]
      : plan.files.map((file) => ({ path: file.filePath, content: file.patched }));

    try {
      const result = await github.createPullRequest({
        repoOwner,
        repoName,
        title,
        body: describePlan(plan, targets),
        branchName: `sentinel/${all ? 'fixes' : targets[0].id}-${Date.now().toString().slice(-6)}`,
        files,
      });

      const fixes = await applyFix(all ? 'all' : (id as string), result.prUrl);

      return NextResponse.json({
        success: true,
        prUrl: result.prUrl,
        patched: !patchedNothing,
        applied: plan.applied,
        refused: plan.refused,
        filesChanged: plan.files.map((file) => file.filePath),
        fixes,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: `GitHub rejected the request: ${(error as Error).message}` },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
