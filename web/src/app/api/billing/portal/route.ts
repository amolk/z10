import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createBillingPortalSession } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id));

  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a plan first." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;

  const portalSession = await createBillingPortalSession({
    stripeCustomerId: user.stripeCustomerId,
    returnUrl: `${origin}/dashboard/settings`,
  });

  return NextResponse.json({ url: portalSession.url });
}
