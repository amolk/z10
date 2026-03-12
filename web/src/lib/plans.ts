/**
 * Pricing plan definitions — feature gates, limits, and tier metadata.
 *
 * Three tiers:
 *   free  — try the product (3 projects, 50 MCP calls/day)
 *   pro   — individual power users ($19/mo, unlimited projects)
 *   team  — collaborative teams ($49/mo per seat)
 */

export type PlanId = "free" | "pro" | "team";

export interface PlanLimits {
  /** Max projects per user/team */
  maxProjects: number;
  /** Max MCP tool calls per day */
  maxMcpCallsPerDay: number;
  /** Max file size in bytes (content column) */
  maxFileSizeBytes: number;
  /** Max team members (only relevant for team plan) */
  maxTeamMembers: number;
  /** Max API keys */
  maxApiKeys: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  /** Monthly price in cents (USD). 0 = free tier */
  priceMonthly: number;
  /** Annual price in cents per month (discount) */
  priceAnnual: number;
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "Get started with Zero-10",
    priceMonthly: 0,
    priceAnnual: 0,
    limits: {
      maxProjects: 3,
      maxMcpCallsPerDay: 1000,
      maxFileSizeBytes: 512 * 1024, // 512 KB
      maxTeamMembers: 1,
      maxApiKeys: 2,
    },
    features: [
      "3 projects",
      "50 MCP calls/day",
      "Community support",
      "All editor features",
      "Code export (React, Vue, Svelte)",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For professional designers and developers",
    priceMonthly: 1900, // $19/mo
    priceAnnual: 1500, // $15/mo billed annually
    limits: {
      maxProjects: 100,
      maxMcpCallsPerDay: 5000,
      maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
      maxTeamMembers: 1,
      maxApiKeys: 10,
    },
    features: [
      "100 projects",
      "5,000 MCP calls/day",
      "Priority support",
      "All editor features",
      "Code export (React, Vue, Svelte)",
      "Custom design tokens",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    description: "For teams building together",
    priceMonthly: 4900, // $49/mo per seat
    priceAnnual: 3900, // $39/mo per seat billed annually
    limits: {
      maxProjects: 500,
      maxMcpCallsPerDay: 20000,
      maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
      maxTeamMembers: 50,
      maxApiKeys: 50,
    },
    features: [
      "500 projects",
      "20,000 MCP calls/day",
      "Dedicated support",
      "All editor features",
      "Code export (React, Vue, Svelte)",
      "Custom design tokens",
      "Team collaboration",
      "Shared project library",
    ],
  },
};

/** Get the plan definition for a given plan ID, defaulting to free */
export function getPlan(planId: PlanId | string | null | undefined): PlanDefinition {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS.free;
}

/** Check if a user has reached their project limit */
export function isAtProjectLimit(planId: PlanId, currentCount: number): boolean {
  return currentCount >= PLANS[planId].limits.maxProjects;
}

/** Check if a user has reached their daily MCP call limit */
export function isAtMcpLimit(planId: PlanId, currentCount: number): boolean {
  return currentCount >= PLANS[planId].limits.maxMcpCallsPerDay;
}
