/**
 * Usage metering — tracks MCP calls, project counts, and storage per user.
 * Used for plan limit enforcement (Phase 5).
 */

import { db } from "@/db";
import { dailyUsage, projects } from "@/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { getPlan, type PlanId } from "./plans";

/** Get today's date as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Increment the MCP call counter for a user today */
export async function incrementMcpCalls(userId: string): Promise<void> {
  const date = today();
  await db
    .insert(dailyUsage)
    .values({ userId, date, mcpCalls: 1, storageBytes: 0 })
    .onConflictDoUpdate({
      target: [dailyUsage.userId, dailyUsage.date],
      set: { mcpCalls: sql`${dailyUsage.mcpCalls} + 1` },
    });
}

/** Get the MCP call count for a user today */
export async function getMcpCallsToday(userId: string): Promise<number> {
  const date = today();
  const [row] = await db
    .select({ mcpCalls: dailyUsage.mcpCalls })
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.date, date)));
  return row?.mcpCalls ?? 0;
}

/** Check if a user has exceeded their daily MCP call limit */
export async function checkMcpLimit(
  userId: string,
  planId: PlanId
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = getPlan(planId);
  const current = await getMcpCallsToday(userId);
  return {
    allowed: current < plan.limits.maxMcpCallsPerDay,
    current,
    limit: plan.limits.maxMcpCallsPerDay,
  };
}

/** Get the project count for a user */
export async function getProjectCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(projects)
    .where(eq(projects.ownerId, userId));
  return row?.count ?? 0;
}

/** Check if a user has reached their project limit */
export async function checkProjectLimit(
  userId: string,
  planId: PlanId
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = getPlan(planId);
  const current = await getProjectCount(userId);
  return {
    allowed: current < plan.limits.maxProjects,
    current,
    limit: plan.limits.maxProjects,
  };
}

/** Update storage bytes for a user (called on project save) */
export async function updateStorageBytes(
  userId: string,
  bytes: number
): Promise<void> {
  const date = today();
  await db
    .insert(dailyUsage)
    .values({ userId, date, mcpCalls: 0, storageBytes: bytes })
    .onConflictDoUpdate({
      target: [dailyUsage.userId, dailyUsage.date],
      set: { storageBytes: bytes },
    });
}
