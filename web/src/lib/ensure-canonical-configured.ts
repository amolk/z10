/**
 * Shared canonical DOM configuration helper.
 *
 * Both sync/route.ts and transact/route.ts need to configure the canonical DOM
 * manager before first use. This module centralizes that setup so the onPersist
 * and onPersistTxId callbacks are defined in one place.
 */

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { configureCanonicalDOM } from "@/lib/canonical-dom";

let configured = false;

export function ensureCanonicalConfigured(): void {
  if (configured) return;
  configured = true;
  configureCanonicalDOM({
    // Persist on every commit so in-memory state survives HMR/restart.
    // Batching was hiding data loss when the module reloaded before the
    // 10-commit / 60s threshold fired.
    persistEveryNCommits: 1,
    onPersist: async (projectId, html, txId) => {
      await db
        .update(projects)
        .set({ content: html, lastTxId: txId, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    },
    onPersistTxId: async (projectId, txId) => {
      await db
        .update(projects)
        .set({ lastTxId: txId, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    },
  });
}
