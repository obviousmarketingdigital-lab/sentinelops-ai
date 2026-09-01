import { NextResponse } from 'next/server';
import { getMockOrganization, checkQuota } from '@/lib/saas-auth';

let currentOrg = getMockOrganization();

export async function GET() {
  return NextResponse.json({
    success: true,
    organization: currentOrg,
    hasQuota: checkQuota(currentOrg)
  });
}

export async function POST(request: Request) {
  try {
    const { action, tier } = await request.json();

    if (action === 'upgrade' && tier) {
      currentOrg.tier = tier;
      if (tier === 'ENTERPRISE') {
        currentOrg.monthlyQuota = 5000;
      } else if (tier === 'PRO') {
        currentOrg.monthlyQuota = 500;
      } else {
        currentOrg.monthlyQuota = 50;
      }
    } else if (action === 'increment_scan') {
      currentOrg.scansUsed += 1;
    }

    return NextResponse.json({
      success: true,
      organization: currentOrg,
      hasQuota: checkQuota(currentOrg)
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
