import { NextResponse } from 'next/server';
import { analyzeCloudInfrastructure } from '@/lib/cloud-analyzer';
import { executeRemediationAgent } from '@/lib/agent-orchestrator';

export async function POST(request: Request) {
  try {
    const { anomalyId } = await request.json();
    const report = analyzeCloudInfrastructure(true);
    const anomaly = report.anomalies.find((a) => a.id === anomalyId);

    if (!anomaly) {
      return NextResponse.json({ success: false, error: 'Anomaly not found' }, { status: 404 });
    }

    const taskResult = executeRemediationAgent(anomaly);

    return NextResponse.json({
      success: true,
      message: `Autonomous agent successfully fixed anomaly ${anomalyId}`,
      taskResult
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
