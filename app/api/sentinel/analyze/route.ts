import { NextResponse } from 'next/server';
import { analyzeCloudInfrastructure } from '@/lib/cloud-analyzer';

export async function GET() {
  try {
    const report = analyzeCloudInfrastructure(true);
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
