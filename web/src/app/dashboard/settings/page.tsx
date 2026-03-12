import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ApiKeysSection } from "@/components/api-keys-section";
import { BillingSection } from "@/components/billing-section";
import type { PlanId } from "@/lib/plans";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [keys, [dbUser]] = await Promise.all([
    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id!)),
    db
      .select({
        plan: users.plan,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, session.user.id!)),
  ]);

  const currentPlan = (dbUser?.plan ?? "free") as PlanId;
  const stripeCustomerId = dbUser?.stripeCustomerId ?? null;

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-lg font-semibold hover:text-zinc-300 transition-colors">
            Zero-10
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="text-sm text-zinc-400">Settings</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your account, billing, and API access
        </p>

        <div className="mt-8">
          <BillingSection
            currentPlan={currentPlan}
            stripeCustomerId={stripeCustomerId}
          />
        </div>

        <div className="mt-8 border-t border-zinc-800 pt-8">
          <ApiKeysSection initialKeys={keys} />
        </div>
      </main>
    </div>
  );
}
