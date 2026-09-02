import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Compares the delivered signature against one computed from the raw body.
 * The comparison is constant time, and the length is checked first because
 * timingSafeEqual throws on mismatched lengths.
 */
export function isSignatureValid(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const delivered = Buffer.from(signature);
  const computed = Buffer.from(expected);

  if (delivered.length !== computed.length) return false;
  return crypto.timingSafeEqual(delivered, computed);
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  // Without a secret there is no way to tell GitHub apart from anyone else, so
  // the endpoint refuses rather than accepting unauthenticated deliveries.
  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        error: 'GITHUB_WEBHOOK_SECRET is not configured; webhook deliveries are rejected.',
      },
      { status: 503 },
    );
  }

  try {
    const body = await request.text();

    if (!isSignatureValid(body, request.headers.get('x-hub-signature-256'), secret)) {
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
    }

    const event = request.headers.get('x-github-event');

    if (event === 'ping') {
      return NextResponse.json({ success: true, message: 'pong' });
    }

    if (event === 'pull_request') {
      const payload = JSON.parse(body) as {
        action?: string;
        pull_request?: { html_url?: string };
      };
      if (payload.action === 'opened') {
        console.log(
          `Sentinel: pull request opened at ${payload.pull_request?.html_url ?? 'unknown URL'}`,
        );
      }
    }

    return NextResponse.json({ success: true, event });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}
