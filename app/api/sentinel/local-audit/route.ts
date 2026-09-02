import { NextResponse } from 'next/server';
import { auditLocalProject } from '@/lib/local-project-analyzer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await auditLocalProject();
    return NextResponse.json({ success: true, report }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
