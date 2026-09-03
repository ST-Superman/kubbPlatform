import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates a one-time ($5.99 / 12-month) Stripe Checkout Session for the signed-in user
 * and returns its URL. Fulfillment happens in the webhook (never here) — see
 * app/api/stripe/webhook/route.ts. The user id rides on client_reference_id + metadata
 * so the webhook knows whose membership to credit.
 */
export async function POST(req: NextRequest) {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "STRIPE_PRICE_ID is not set." }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Reuse the Stripe customer if we've stored one (RLS lets a user read their own row).
  const { data: membership } = await supabase
    .from("memberships")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const existingCustomer = membership?.stripe_customer_id ?? null;

  const stripe = getStripe();
  const origin = req.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    // Attach the same id to the PaymentIntent for reconciliation in the dashboard.
    payment_intent_data: { metadata: { supabase_user_id: user.id } },
    // Reuse an existing customer, else let Checkout create one on success (avoids
    // orphan customers from abandoned first checkouts). The webhook persists the id.
    ...(existingCustomer
      ? { customer: existingCustomer }
      : { customer_email: user.email, customer_creation: "always" as const }),
    success_url: `${origin}/membership?status=success`,
    cancel_url: `${origin}/membership?status=cancelled`,
    // Tags the flow for tracking/comparison in the Stripe dashboard.
    integration_identifier: "kubb-membership-zqmvwptk",
    // payment_method_types intentionally omitted → dynamic payment methods.
  });

  return NextResponse.json({ url: session.url });
}
