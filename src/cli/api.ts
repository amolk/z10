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

export async function execStatement(
  projectId: string,
  statement: string,
  localChecksum: string
): Promise<ExecResult> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/exec`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ statement, localChecksum }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, checksum: localChecksum, error: `Server error (${res.status}): ${text}` };
  }

  return await res.json() as ExecResult;
}

export async function fetchDom(
  projectId: string,
  options?: { compact?: boolean; pageId?: string }
): Promise<DomResult> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const params = new URLSearchParams();
  if (options?.compact) params.set('compact', 'true');
  if (options?.pageId) params.set('page', options.pageId);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/dom${qs}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch DOM (${res.status}): ${await res.text()}`);
  }

  return await res.json() as DomResult;
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
