import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

/** Amounts are in cents and are the only plans that may be charged. */
const PLANS: Record<string, { name: string; unitAmount: number }> = {
  plan_growth: { name: 'SentinelOps Growth Plan', unitAmount: 14900 },
  plan_scale: { name: 'SentinelOps Scale Plan', unitAmount: 49900 },
};

export async function POST(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  // A checkout endpoint never simulates. Without a key it reports that billing
  // is unavailable, so nothing downstream can mistake a placeholder for a paid
  // subscription.
  if (!stripeSecret || !stripeSecret.startsWith('sk_')) {
    return NextResponse.json(
      { success: false, error: 'Billing is not configured. Set STRIPE_SECRET_KEY to enable checkout.' },
      { status: 503 },
    );
  }

  try {
    const { planId, email } = (await request.json()) as { planId?: string; email?: string };
    const plan = planId ? PLANS[planId] : undefined;

    // An unknown plan is rejected rather than silently billed at the cheapest
    // price, which is what a fallback amount would do.
    if (!plan) {
      return NextResponse.json(
        { success: false, error: `Unknown plan. Valid plans: ${Object.keys(PLANS).join(', ')}.` },
        { status: 400 },
      );
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-02-28.acacia' as never });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3009';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      // Left undefined when absent; a placeholder address would attach a
      // stranger's email to a real subscription.
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: plan.name },
            unit_amount: plan.unitAmount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/sentinel?success=true`,
      cancel_url: `${appUrl}/revenue?canceled=true`,
    });

    return NextResponse.json({
      success: true,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
