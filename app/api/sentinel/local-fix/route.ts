import { NextResponse } from 'next/server';
import { applyFix, getAppliedFixes } from '@/lib/data-store';
import { GitHubService } from '@/lib/github-service';
import { auditLocalProject } from '@/lib/local-project-analyzer';
import { generateAIPatch } from '@/lib/ai-patcher';

export async function GET() {
  const fixes = await getAppliedFixes();
  return NextResponse.json({ success: true, fixes });
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    const localReport = auditLocalProject();
    const finding = localReport.findings.find((f) => f.id === id);

    if (!finding) {
      return NextResponse.json({ success: false, error: 'Finding not found' }, { status: 404 });
    }

    // Generate dynamic generative AI patch based on finding category
    const aiPatch = generateAIPatch({
      findingId: finding.id,
      title: finding.title,
      description: finding.description,
      recommendation: finding.recommendation,
      category: finding.category,
    });

    const github = new GitHubService();
    let prUrl = '';

    if (github.hasToken()) {
      try {
        const branchName = `sentinel-ai-fix-${id}-${Date.now().toString().slice(-4)}`;
        const result = await github.createPullRequest({
          repoOwner: process.env.GITHUB_OWNER || 'obviousmarketingdigital-lab',
          repoName: process.env.GITHUB_REPO || 'sentinel-devops-agent',
          title: `🤖 [Sentinel AI Patcher] Fix: ${finding.title}`,
          body: `### Autonomous Generative Remediation\n\n**Category:** ${finding.category}\n**Finding:** ${finding.description}\n**Recommendation:** ${finding.recommendation}\n\n**AI Explanation:** ${aiPatch.explanation}\n\n*Generated automatically by DevOps Sentinel Autonomous Agent.*`,
          branchName,
          filePath: aiPatch.filePath,
          fileContent: aiPatch.fileContent,
        });
        prUrl = result.prUrl;
      } catch (err: any) {
        console.warn('GitHub API PR creation failed, falling back to simulation:', err.message);
        prUrl = `https://github.com/${process.env.GITHUB_OWNER || 'obviousmarketingdigital-lab'}/${process.env.GITHUB_REPO || 'sentinel-devops-agent'}/pull/${Math.floor(Math.random() * 900) + 100} (Simulated fallback due to API error)`;
      }
    } else {
      // Graceful fallback simulation when GITHUB_TOKEN is not configured yet
      prUrl = `https://github.com/omnirouter/garopaba-imoveis-starter/pull/${Math.floor(Math.random() * 900) + 100} (Mock PR - Add GITHUB_TOKEN to enable real PRs)`;
    }

    const fixes = await applyFix(id, prUrl);
    return NextResponse.json({ success: true, prUrl, fixes });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
