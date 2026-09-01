import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Minimal GitHub Webhook listener
export async function POST(request: Request) {
  try {
    const signature = request.headers.get('x-hub-signature-256');
    const body = await request.text();
    const event = request.headers.get('x-github-event');

    // In a real environment, you MUST verify the signature with GITHUB_WEBHOOK_SECRET
    // if (!verifySignature(body, signature)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`GitHub Webhook received event: ${event}`);

    if (event === 'pull_request') {
      const data = JSON.parse(body);
      if (data.action === 'opened') {
        console.log(`Sentinel: New PR detected at ${data.pull_request.html_url}. Triggering autonomous scan...`);
        // Here you would trigger the Sentinel scan workflow
      }
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
