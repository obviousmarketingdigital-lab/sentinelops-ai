import { NextResponse } from 'next/server';
import {
  FLEET_SAMPLE_NOTICE,
  getMicroservicesStatus,
  sweepMicroservice,
} from '@/lib/microservices-monitor';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    mode: 'sample',
    notice: FLEET_SAMPLE_NOTICE,
    services: getMicroservicesStatus(),
  });
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Service ID required' }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      mode: 'sample',
      notice: FLEET_SAMPLE_NOTICE,
      services: sweepMicroservice(id),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
