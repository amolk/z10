/**
 * MCP authentication helper.
 *
 * Supports three auth methods:
 *   1. NextAuth session (cookie-based, for browser / dashboard)
 *   2. Connect token via `Authorization: Bearer z10_ct_...` (project-scoped, re-displayable)
 *   3. API key via `Authorization: Bearer z10_ak_...` header (for CLI / agents)
 */

import { auth } from "@/auth";
import { db } from "@/db";
import { apiKeys, connectTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

export type McpAuthResult = { userId: string; projectId?: string } | null;

/**
 * Hash an API key using SHA-256 (Node.js native crypto — synchronous and faster
 * than Web Crypto API for server-side use).
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Generate a new API key string.  Format: z10_ak_<32 hex chars>
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `z10_ak_${hex}`;
}

/**
 * Generate a new connect token string.  Format: z10_ct_<32 hex chars>
 */
export function generateConnectToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `z10_ct_${hex}`;
}

/** 30 days in milliseconds */
export const CONNECT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Authenticate an MCP request. Tries session auth first, then connect token, then API key.
 */
export async function authenticateMcp(
  request: Request
): Promise<McpAuthResult> {
  // 1. Try NextAuth session (cookie-based)
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id };
  }

  // 2. Try Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7).trim();

    // 2a. Connect token (hash-based lookup, project-scoped)
    if (rawToken.startsWith("z10_ct_")) {
      const tokenHash = hashApiKey(rawToken);

      // Try hash-based lookup first (new tokens), fall back to plaintext (legacy)
      let found: { userId: string; projectId: string; expiresAt: Date } | undefined;
      let foundByHash = false;
      const [byHash] = await db
        .select({
          userId: connectTokens.userId,
          projectId: connectTokens.projectId,
          expiresAt: connectTokens.expiresAt,
        })
        .from(connectTokens)
        .where(eq(connectTokens.tokenHash, tokenHash));

      if (byHash) {
        found = byHash;
        foundByHash = true;
      } else {
        // Legacy fallback: plaintext lookup for tokens created before migration
        const [byPlain] = await db
          .select({
            userId: connectTokens.userId,
            projectId: connectTokens.projectId,
            expiresAt: connectTokens.expiresAt,
          })
          .from(connectTokens)
          .where(eq(connectTokens.token, rawToken));
        if (byPlain) found = byPlain;
      }

      if (!found) return null;
      if (found.expiresAt < new Date()) return null;

      // Auto-refresh expiry on use (extend by 30 days)
      const newExpiry = new Date(Date.now() + CONNECT_TOKEN_TTL_MS);
      db.update(connectTokens)
        .set({ lastUsedAt: new Date(), expiresAt: newExpiry })
        .where(foundByHash
          ? eq(connectTokens.tokenHash, tokenHash)
          : eq(connectTokens.token, rawToken))
        .then(() => {})
        .catch(() => {});

      return { userId: found.userId, projectId: found.projectId };
    }

    // 2b. API key (hash-based lookup)
    if (!rawToken.startsWith("z10_ak_")) {
      return null;
    }

    const keyHash = hashApiKey(rawToken);
    const [found] = await db
      .select({ userId: apiKeys.userId, expiresAt: apiKeys.expiresAt })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash));

    if (!found) {
      return null;
    }

    // Check expiry
    if (found.expiresAt && found.expiresAt < new Date()) {
      return null;
    }

    // Update last-used timestamp (fire-and-forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.keyHash, keyHash))
      .then(() => {})
      .catch(() => {});

    return { userId: found.userId };
  }

  return null;
}
