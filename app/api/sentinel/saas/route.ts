import { NextResponse } from 'next/server';
import { SAAS_SAMPLE_NOTICE, checkQuota, getMockOrganization } from '@/lib/saas-auth';

export const dynamic = 'force-dynamic';

const currentOrg = getMockOrganization();

export async function GET() {
  return NextResponse.json({
    success: true,
    mode: 'sample',
    notice: SAAS_SAMPLE_NOTICE,
    organization: currentOrg,
    hasQuota: checkQuota(currentOrg),
  });
}

export async function POST(request: Request) {
  try {
    const { action, tier } = await request.json();

    if (action === 'upgrade' && tier) {
      currentOrg.tier = tier;
      currentOrg.monthlyQuota = tier === 'ENTERPRISE' ? 5000 : tier === 'PRO' ? 500 : 50;
    } else if (action === 'increment_scan') {
      currentOrg.scansUsed += 1;
    }

    return NextResponse.json({
      success: true,
      mode: 'sample',
      notice: SAAS_SAMPLE_NOTICE,
      organization: currentOrg,
      hasQuota: checkQuota(currentOrg),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
