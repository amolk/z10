import Stripe from "stripe";
import type { PlanId } from "./plans";

let _stripe: Stripe | null = null;

/** Lazily initialized Stripe client (requires STRIPE_SECRET_KEY env var) */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required");
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/**
 * Map plan IDs to Stripe Price IDs.
 * Set via environment variables: STRIPE_PRICE_PRO_MONTHLY, etc.
 */
export function getStripePriceId(
  planId: PlanId,
  interval: "month" | "year"
): string | null {
  if (planId === "free") return null;

  const envKey = `STRIPE_PRICE_${planId.toUpperCase()}_${interval === "year" ? "ANNUAL" : "MONTHLY"}`;
  return process.env[envKey] ?? null;
}

/** Create a Stripe Checkout session for plan subscription */
export async function createCheckoutSession({
  userId,
  email,
  planId,
  interval = "month",
  successUrl,
  cancelUrl,
  stripeCustomerId,
}: {
  userId: string;
  email: string;
  planId: PlanId;
  interval?: "month" | "year";
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string | null;
}) {
  const priceId = getStripePriceId(planId, interval);
  if (!priceId) {
    throw new Error(`No Stripe price configured for ${planId}/${interval}`);
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId ?? undefined,
    customer_email: stripeCustomerId ? undefined : email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, planId },
    subscription_data: {
      metadata: { userId, planId },
    },
  });

  return session;
}

/** Create a Stripe Billing Portal session */
export async function createBillingPortalSession({
  stripeCustomerId,
  returnUrl,
}: {
  stripeCustomerId: string;
  returnUrl: string;
}) {
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session;
}
