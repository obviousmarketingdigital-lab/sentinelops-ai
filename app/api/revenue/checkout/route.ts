import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripeSecret = process.env.STRIPE_SECRET_KEY;

export async function POST(request: Request) {
  try {
    const { planId, email } = await request.json();
    if (!planId) {
      return NextResponse.json({ success: false, error: 'Plan ID required' }, { status: 400 });
    }

    // If Stripe secret key is configured, create a real Stripe checkout session
    if (stripeSecret && stripeSecret.startsWith('sk_')) {
      const stripe = new Stripe(stripeSecret, {
        apiVersion: '2025-02-28.acacia' as any,
      });

      const priceMap: Record<string, number> = {
        plan_growth: 14900, // $149.00
        plan_scale: 49900,  // $499.00
      };

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email || 'founder@example.com',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: planId === 'plan_growth' ? 'SentinelOps Growth Plan' : 'SentinelOps Scale Plan',
              },
              unit_amount: priceMap[planId] || 14900,
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
        message: 'Real Stripe checkout session created successfully'
      });
    }

    // Fallback simulation when Stripe key is not configured
    const checkoutSessionId = `cs_live_${Math.random().toString(36).substring(2, 15)}`;
    const checkoutUrl = `/sentinel?success=true&simulated=true&plan=${planId}`;

    return NextResponse.json({
      success: true,
      checkoutSessionId,
      checkoutUrl,
      message: `Simulated Stripe Checkout session created for plan ${planId} (Configure STRIPE_SECRET_KEY for live mode)`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
