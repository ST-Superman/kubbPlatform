import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Stripe webhook — the ONLY place membership access is granted (never the success page).
 * Verifies the signature, then on a paid Checkout session credits the buyer's 12-month
 * window via record_membership_purchase (idempotent, so Stripe's retries are safe).
 *
 * Handles both checkout.session.completed and .async_payment_succeeded, gated on
 * payment_status, so delayed-notification methods grant access only once actually paid.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse("STRIPE_WEBHOOK_SECRET is not set.", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("missing signature", { status: 400 });

  const body = await req.text(); // raw body required for signature verification
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid signature";
    return new NextResponse(`Webhook signature verification failed: ${msg}`, {
      status: 400,
    });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;

    // Only fulfill once actually paid (async methods fire completed while still unpaid).
    if (session.payment_status !== "unpaid") {
      const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
      const customerId =
        typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);

      if (userId) {
        const admin = createAdminClient();
        const { error } = await admin.rpc("record_membership_purchase", {
          p_session_id: session.id,
          p_user_id: userId,
          p_amount_cents: session.amount_total,
          p_customer_id: customerId,
        });
        if (error) {
          // 500 → Stripe retries later (the credit is idempotent, so retries are safe).
          console.error("record_membership_purchase failed", error);
          return new NextResponse("crediting failed", { status: 500 });
        }
      } else {
        console.error("checkout session missing user id", session.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
