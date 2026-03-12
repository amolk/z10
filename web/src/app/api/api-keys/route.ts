/**
 * API key management endpoint.
 *
 * POST /api/api-keys  — Create a new API key (returns the raw key once)
 * GET  /api/api-keys  — List existing keys (prefix + metadata only)
 */

import { auth } from "@/auth";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateApiKey, hashApiKey } from "@/lib/mcp-auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json().catch(() => ({}));
  const name = (body as { name?: string }).name || "Unnamed key";

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 15) + "...";

  const [created] = await db
    .insert(apiKeys)
    .values({
      userId: session.user.id,
      name,
      keyHash,
      keyPrefix,
    })
    .returning({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, createdAt: apiKeys.createdAt });

  return new Response(
    JSON.stringify({
      ...created,
      // The raw key is shown ONLY at creation time
      key: rawKey,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, session.user.id));

  return new Response(JSON.stringify(keys), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
