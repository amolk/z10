/**
 * CLI Server Communication
 *
 * HTTP client for z10 server API.
 * Handles auth, statement execution, DOM retrieval, and checksum comparison.
 */

import { loadSession } from './session.js';

export interface ExecResult {
  success: boolean;
  checksum: string;
  error?: string;
}

export interface DomResult {
  html: string;
  checksum: string;
}

async function getBaseUrl(): Promise<string> {
  const session = await loadSession();
  return session.serverUrl ?? 'http://127.0.0.1:29910';
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await loadSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (session.authToken) {
    headers['Authorization'] = `Bearer ${session.authToken}`;
  }
  return headers;
}

export interface ExecStreamEvent {
  type: 'result' | 'done' | 'error';
  statement?: string;
  success?: boolean;
  error?: string;
  checksum: string;
}

export interface TransactResult {
  status: 'committed' | 'rejected';
  txId?: number;
  timestamp?: number;
  reason?: string;
  conflicts?: unknown[];
  error?: string;
  freshHtml?: string;
  patch?: unknown;
}

/**
 * Send code to the server's /transact endpoint for execution against
 * the canonical DOM. Returns committed result or rejection details.
 */
export async function transact(
  projectId: string,
  code: string,
  subtreeRootNid?: string,
): Promise<TransactResult> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/transact`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      code,
      subtreeRootNid: subtreeRootNid ?? null,
      // Omit manifest → server builds fresh one (trusted mode)
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server error (${res.status}): ${text}`);
  }

  return await res.json() as TransactResult;
}

export async function fetchDom(
  projectId: string,
  options?: { compact?: boolean; pageId?: string }
): Promise<DomResult> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  // The /dom endpoint was replaced by /sync (returns { html, txId }).
  // We hit /sync and map the response to the DomResult shape the CLI expects.
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/sync`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch DOM (${res.status}): ${await res.text()}`);
  }

  const data = await res.json() as { html: string; txId: number };
  return { html: data.html, checksum: String(data.txId) };
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch projects (${res.status}): ${await res.text()}`);
  }

  const data = await res.json() as { projects: ProjectSummary[] };
  return data.projects;
}

export interface PageSummary {
  name: string;
  rootNodeId: string;
  mode: string;
}

export async function fetchPages(projectId: string): Promise<PageSummary[]> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/pages`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch pages (${res.status}): ${await res.text()}`);
  }

  const data = await res.json() as { pages: PageSummary[] };
  return data.pages;
}

export async function fetchComponents(projectId: string): Promise<string[]> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/components`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch components (${res.status}): ${await res.text()}`);
  }

  const data = await res.json() as { components: string[] };
  return data.components;
}

export async function fetchTokens(projectId: string): Promise<{
  primitives: Record<string, string>;
  semantic: Record<string, string>;
}> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/tokens`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch tokens (${res.status}): ${await res.text()}`);
  }

  return await res.json() as { primitives: Record<string, string>; semantic: Record<string, string> };
}

// ── New collaborative DOM API functions (Phase B/C) ──

export interface SyncResult {
  html: string;
  txId: number;
}

/**
 * Fetch initial sync data: full DOM + current txId.
 * Used by B6 (CLI startup) to bootstrap the local proxy.
 */
export async function fetchSync(projectId: string): Promise<SyncResult> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/sync`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch sync (${res.status}): ${await res.text()}`);
  }

  return await res.json() as SyncResult;
}

/**
 * Get the server base URL and auth token for SSE connections.
 * Used by PatchStream (B5).
 */
export async function getConnectionInfo(): Promise<{ baseUrl: string; authToken?: string }> {
  const session = await loadSession();
  return {
    baseUrl: session.serverUrl ?? 'http://127.0.0.1:29910',
    authToken: session.authToken ?? undefined,
  };
}
