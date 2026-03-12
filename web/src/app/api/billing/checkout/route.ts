import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCheckoutSession } from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const planId = body.planId as PlanId;
  const interval = (body.interval as "month" | "year") ?? "month";

  if (!planId || !["pro", "team"].includes(planId)) {
    return NextResponse.json(
      { error: "Invalid plan. Choose pro or team." },
      { status: 400 }
    );
  }

  // Look up user for existing Stripe customer ID
  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id));

  const origin = new URL(request.url).origin;

  const checkoutSession = await createCheckoutSession({
    userId: session.user.id,
    email: session.user.email,
    planId,
    interval,
    stripeCustomerId: user?.stripeCustomerId,
    successUrl: `${origin}/dashboard/settings?billing=success`,
    cancelUrl: `${origin}/dashboard/settings?billing=cancelled`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
