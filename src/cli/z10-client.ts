/**
 * Z10Client — single owner of authenticated API access.
 *
 * Loads session once, caches auth headers, provides all domain methods.
 * Replaces the 13 independent loadSession() calls in api.ts.
 */

import { loadSession, type SessionState } from './session.js';

// ── Public types (previously exported from api.ts) ──

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

export interface DomResult {
  html: string;
  checksum: string;
}

export interface SyncResult {
  html: string;
  txId: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface PageSummary {
  name: string;
  rootNodeId: string;
  mode: string;
}

export interface ComponentListResult {
  components: string[];
  schemas?: Record<string, unknown>[];
}

// ── Z10Client ──

export interface Z10ClientOptions {
  sessionPath?: string;
  serverUrl?: string;
  authToken?: string;
}

export class Z10Client {
  private baseUrl: string;
  private headers: Record<string, string>;

  private constructor(session: SessionState, opts?: Z10ClientOptions) {
    this.baseUrl = opts?.serverUrl ?? session.serverUrl ?? 'http://127.0.0.1:29910';
    this.headers = { 'Content-Type': 'application/json' };
    const token = opts?.authToken ?? session.authToken;
    if (token) {
      this.headers['Authorization'] = `Bearer ${token}`;
    }
  }

  /** Create a client, loading session once and caching it. */
  static async create(opts?: Z10ClientOptions): Promise<Z10Client> {
    const session = await loadSession();
    return new Z10Client(session, opts);
  }

  /** Get connection info for SSE/proxy connections. */
  getConnectionInfo(): { baseUrl: string; authToken?: string } {
    const auth = this.headers['Authorization'];
    return {
      baseUrl: this.baseUrl,
      authToken: auth?.startsWith('Bearer ') ? auth.slice(7) : undefined,
    };
  }

  // ── Internal HTTP ──

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error (${res.status}): ${text}`);
    }
    return await res.json() as T;
  }

  private async requestVoid(method: string, path: string, body?: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error (${res.status}): ${text}`);
    }
  }

  // ── Domain methods ──

  async transact(projectId: string, code: string, subtreeRootNid?: string): Promise<TransactResult> {
    return this.request<TransactResult>(
      'POST',
      `/api/projects/${projectId}/transact`,
      { code, subtreeRootNid: subtreeRootNid ?? null },
    );
  }

  async fetchDom(projectId: string, _options?: { pageId?: string }): Promise<DomResult> {
    const data = await this.request<{ html: string; txId: number }>(
      'GET',
      `/api/projects/${projectId}/sync`,
    );
    return { html: data.html, checksum: String(data.txId) };
  }

  async fetchSync(projectId: string): Promise<SyncResult> {
    return this.request<SyncResult>('GET', `/api/projects/${projectId}/sync`);
  }

  async fetchProjects(): Promise<ProjectSummary[]> {
    const data = await this.request<{ projects: ProjectSummary[] }>('GET', '/api/projects');
    return data.projects;
  }

  async fetchPages(projectId: string): Promise<PageSummary[]> {
    const data = await this.request<{ pages: PageSummary[] }>(
      'GET',
      `/api/projects/${projectId}/pages`,
    );
    return data.pages;
  }

  async fetchComponents(projectId: string): Promise<string[]> {
    const data = await this.request<{ components: string[] }>(
      'GET',
      `/api/projects/${projectId}/components`,
    );
    return data.components;
  }

  async fetchComponentList(projectId: string, verbose?: boolean): Promise<ComponentListResult> {
    const qs = verbose ? '?verbose=true' : '';
    return this.request<ComponentListResult>(
      'GET',
      `/api/projects/${projectId}/components${qs}`,
    );
  }

  async fetchComponentDetail(projectId: string, name: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/projects/${projectId}/components/${encodeURIComponent(name)}`,
    );
  }

  async createComponent(
    projectId: string,
    name: string,
    definition: Record<string, unknown>,
  ): Promise<{ tagName?: string }> {
    return this.request<{ tagName?: string }>(
      'POST',
      `/api/projects/${projectId}/components`,
      { name, ...definition },
    );
  }

  async updateComponent(
    projectId: string,
    name: string,
    definition: Record<string, unknown>,
  ): Promise<void> {
    await this.requestVoid(
      'PUT',
      `/api/projects/${projectId}/components/${encodeURIComponent(name)}`,
      definition,
    );
  }

  async deleteComponent(projectId: string, name: string, detach?: boolean): Promise<void> {
    const qs = detach ? '?detach=true' : '';
    await this.requestVoid(
      'DELETE',
      `/api/projects/${projectId}/components/${encodeURIComponent(name)}${qs}`,
    );
  }

  async fetchTokens(projectId: string): Promise<{
    primitives: Record<string, string>;
    semantic: Record<string, string>;
  }> {
    return this.request<{ primitives: Record<string, string>; semantic: Record<string, string> }>(
      'GET',
      `/api/projects/${projectId}/tokens`,
    );
  }

  /** Clean up resources. No-op for now, but available for future connection pooling. */
  dispose(): void {
    // Placeholder for cleanup
  }
}
