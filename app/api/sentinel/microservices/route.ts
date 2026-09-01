import { NextResponse } from 'next/server';
import { getMicroservicesStatus, sweepMicroservice } from '@/lib/microservices-monitor';

export async function GET() {
  const services = getMicroservicesStatus();
  return NextResponse.json({
    success: true,
    services
  });
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Service ID required' }, { status: 400 });
    }
    const updatedServices = sweepMicroservice(id);
    return NextResponse.json({
      success: true,
      services: updatedServices
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
