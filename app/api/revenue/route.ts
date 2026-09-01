import { NextResponse } from 'next/server';
import { getRevenueCampaigns, getRevenuePlans, generateAICopy } from '@/lib/revenue-engine';

export async function GET() {
  const campaigns = getRevenueCampaigns();
  const plans = getRevenuePlans();
  return NextResponse.json({
    success: true,
    campaigns,
    plans
  });
}

export async function POST(request: Request) {
  try {
    const { niche } = await request.json();
    const copy = generateAICopy(niche);
    return NextResponse.json({
      success: true,
      copy
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
