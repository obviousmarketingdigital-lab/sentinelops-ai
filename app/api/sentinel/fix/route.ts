import { NextResponse } from 'next/server';
import { analyzeCloudInfrastructure } from '@/lib/cloud-analyzer';
import { planRemediation } from '@/lib/agent-orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { anomalyId } = await request.json();
    const report = analyzeCloudInfrastructure();
    const anomaly = report.anomalies.find((item) => item.id === anomalyId);

    if (!anomaly) {
      return NextResponse.json({ success: false, error: 'Anomaly not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      executed: false,
      mode: 'sample',
      notice: report.notice,
      plan: planRemediation(anomaly),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
