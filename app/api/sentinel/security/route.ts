import { NextResponse } from 'next/server';
import { performSecurityScan } from '@/lib/security-scanner';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await performSecurityScan();
  return NextResponse.json(
    { success: result.ok, result },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
