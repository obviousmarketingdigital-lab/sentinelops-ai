import { NextResponse } from 'next/server';
import { applyFix, getAppliedFixes } from '@/lib/data-store';
import { GitHubService } from '@/lib/github-service';
import { auditLocalProject } from '@/lib/local-project-analyzer';
import { buildFindingReport } from '@/lib/ai-patcher';

export const dynamic = 'force-dynamic';

export async function GET() {
  const fixes = await getAppliedFixes();
  return NextResponse.json({ success: true, fixes });
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    const report = await auditLocalProject();
    const finding = report.findings.find((item) => item.id === id);

    if (!finding) {
      return NextResponse.json({ success: false, error: 'Finding not found' }, { status: 404 });
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

    const patch = buildFindingReport(finding);

    try {
      const result = await github.createPullRequest({
        repoOwner,
        repoName,
        title: `[Sentinel] ${finding.title}`,
        body: patch.body,
        branchName: `sentinel/${finding.id}-${Date.now().toString().slice(-6)}`,
        filePath: patch.filePath,
        fileContent: patch.fileContent,
      });

      const fixes = await applyFix(id, result.prUrl);
      return NextResponse.json({ success: true, prUrl: result.prUrl, fixes });
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
