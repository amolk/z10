"use client";

import { useState } from "react";
import { PLANS, type PlanId } from "@/lib/plans";

export function BillingSection({
  currentPlan,
  stripeCustomerId,
}: {
  currentPlan: PlanId;
  stripeCustomerId: string | null;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const plan = PLANS[currentPlan];

  async function handleUpgrade(planId: PlanId, interval: "month" | "year") {
    setLoading(`${planId}-${interval}`);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <h3 className="text-lg font-medium">Plan & Billing</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Manage your subscription and billing details
      </p>

      {/* Current plan */}
      <div className="mt-4 rounded-lg border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-zinc-400">Current plan</span>
            <p className="text-lg font-semibold">{plan.name}</p>
          </div>
          {currentPlan !== "free" && stripeCustomerId && (
            <button
              onClick={handleManageBilling}
              disabled={loading === "portal"}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {loading === "portal" ? "Loading..." : "Manage billing"}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.features.map((feature) => (
            <span
              key={feature}
              className="rounded bg-zinc-800/50 px-2 py-0.5 text-xs text-zinc-400"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Upgrade options */}
      {currentPlan === "free" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(["pro", "team"] as const).map((planId) => {
            const p = PLANS[planId];
            return (
              <div
                key={planId}
                className="rounded-lg border border-zinc-800 p-4"
              >
                <h4 className="font-medium">{p.name}</h4>
                <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
                <p className="mt-2">
                  <span className="text-2xl font-bold">
                    ${(p.priceMonthly / 100).toFixed(0)}
                  </span>
                  <span className="text-sm text-zinc-400">/mo</span>
                </p>
                <ul className="mt-3 space-y-1 text-sm text-zinc-400">
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f}>
                      <span className="mr-1.5 text-green-500">&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleUpgrade(planId, "month")}
                    disabled={loading !== null}
                    className="flex-1 rounded bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                  >
                    {loading === `${planId}-month`
                      ? "Loading..."
                      : "Monthly"}
                  </button>
                  <button
                    onClick={() => handleUpgrade(planId, "year")}
                    disabled={loading !== null}
                    className="flex-1 rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {loading === `${planId}-year`
                      ? "Loading..."
                      : `Annual ($${(p.priceAnnual / 100).toFixed(0)}/mo)`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
