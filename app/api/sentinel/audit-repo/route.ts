import { NextResponse } from 'next/server';
import { auditProject } from '@/lib/local-project-analyzer';
import { performSecurityScan } from '@/lib/security-scanner';
import { createGitHubSource } from '@/lib/project-source';

export const dynamic = 'force-dynamic';

/** Owner and repository names are interpolated into a URL path. */
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const REF = /^[A-Za-z0-9._\/-]+$/;

export async function POST(request: Request) {
  try {
    const { owner, repo, ref } = (await request.json()) as {
      owner?: string;
      repo?: string;
      ref?: string;
    };

    if (!owner || !repo || !SEGMENT.test(owner) || !SEGMENT.test(repo)) {
      return NextResponse.json(
        { success: false, error: 'Provide a valid owner and repo.' },
        { status: 400 },
      );
    }

    if (ref && !REF.test(ref)) {
      return NextResponse.json({ success: false, error: 'Invalid ref.' }, { status: 400 });
    }

    const source = createGitHubSource({
      owner,
      repo,
      ref,
      token: process.env.GITHUB_TOKEN,
    });

    const report = await auditProject(source);
    const scan = await performSecurityScan(source);

    return NextResponse.json(
      { success: true, report, scan },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 502 },
    );
  }
}
