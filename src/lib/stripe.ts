import Stripe from "stripe";

/**
 * Server-only Stripe client. Instantiated once and reused (per Stripe's guidance —
 * call methods on a StripeClient instance, never the deprecated global-key pattern).
 * The API version is left at the SDK default (recent enough for integration_identifier).
 */
let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your Vercel env (server-only) / .env.local.",
    );
  }
  if (!client) client = new Stripe(key);
  return client;
}
