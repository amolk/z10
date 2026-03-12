import { getStripe } from "@/lib/stripe";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PlanId } from "@/lib/plans";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook verification failed: ${message}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId as PlanId | undefined;
      const customerId = session.customer as string;

      if (userId && planId) {
        logger.info("Subscription activated", { userId, planId, customerId });
        await db
          .update(users)
          .set({
            plan: planId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: session.subscription as string,
          })
          .where(eq(users.id, userId));
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;
      const planId = subscription.metadata?.planId as PlanId | undefined;

      if (userId && planId) {
        await db
          .update(users)
          .set({ plan: planId })
          .where(eq(users.id, userId));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;

      if (userId) {
        await db
          .update(users)
          .set({
            plan: "free",
            stripeSubscriptionId: null,
          })
          .where(eq(users.id, userId));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
