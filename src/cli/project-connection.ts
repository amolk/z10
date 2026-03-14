/**
 * B6. CLI startup + resync — project connection manager.
 *
 * On first operation for a project: fetch full document + current txId
 * from server (C4), bootstrap into LocalProxy, subscribe to patch stream (B5).
 * On gap too large: full resync discards local DOM, rebuilds from server.
 *
 * This module manages the lifecycle of a single project's connection:
 * LocalProxy (in-memory DOM) + PatchStream (SSE subscription).
 *
 * §7.4, §7.5, §14.6
 */

import { LocalProxy } from '../dom/proxy.js';
import { PatchStream, type PatchStreamOptions } from './patch-stream.js';
import { fetchSync, getConnectionInfo } from './api.js';

export interface ProjectConnectionOptions {
  /** Project ID to connect to. */
  projectId: string;
  /** Callback on connection established. */
  onConnected?: (txId: number) => void;
  /** Callback on error. */
  onError?: (error: Error) => void;
  /** Callback on full resync. */
  onResync?: (txId: number) => void;
}

/**
 * Manages the connection to a single project's collaborative DOM.
 *
 * Usage:
 *   const conn = new ProjectConnection({ projectId: 'abc' });
 *   await conn.connect();          // Initial sync + patch subscription
 *   const result = await conn.proxy.submitCode(code, ticketId);
 *   conn.disconnect();
 */
export class ProjectConnection {
  readonly proxy: LocalProxy;
  private patchStream: PatchStream | null = null;
  private projectId: string;
  private options: ProjectConnectionOptions;
  private connected = false;

  constructor(options: ProjectConnectionOptions) {
    this.options = options;
    this.projectId = options.projectId;
    this.proxy = new LocalProxy();
  }

  /**
   * Connect to the server: fetch initial DOM, bootstrap LocalProxy,
   * and subscribe to the SSE patch stream.
   */
  async connect(): Promise<void> {
    // Step 1: Fetch initial sync (full DOM + txId) from server
    const sync = await fetchSync(this.projectId);

    // Step 2: Load into LocalProxy
    this.proxy.loadDocument(sync.html, sync.txId);

    // Step 3: Subscribe to patch stream
    const connInfo = await getConnectionInfo();

    const streamOpts: PatchStreamOptions = {
      baseUrl: connInfo.baseUrl,
      authToken: connInfo.authToken,
      projectId: this.projectId,
      proxy: this.proxy,
      onConnect: (txId) => {
        this.connected = true;
        this.options.onConnected?.(txId);
      },
      onResync: (txId) => {
        this.options.onResync?.(txId);
      },
      onError: (error) => {
        this.options.onError?.(error);
      },
      onDisconnect: () => {
        this.connected = false;
      },
    };

    this.patchStream = new PatchStream(streamOpts);
    this.patchStream.start();
  }

  /**
   * Force a full resync: discard local DOM, rebuild from server.
   * Used when gap is too large or state is inconsistent.
   */
  async resync(): Promise<void> {
    const sync = await fetchSync(this.projectId);
    this.proxy.loadDocument(sync.html, sync.txId);
    this.options.onResync?.(sync.txId);
  }

  /** Whether the connection is active. */
  get isConnected(): boolean {
    return this.connected;
  }

  /** Disconnect from the server and clean up resources. */
  disconnect(): void {
    if (this.patchStream) {
      this.patchStream.stop();
      this.patchStream = null;
    }
    this.connected = false;
    this.proxy.dispose();
  }
}

// ── Singleton connection manager for CLI process ──

const connections = new Map<string, ProjectConnection>();

/**
 * Get or create a connection for a project.
 * First call triggers initial sync + patch subscription.
 */
export async function getProjectConnection(
  projectId: string,
  options?: Omit<ProjectConnectionOptions, 'projectId'>,
): Promise<ProjectConnection> {
  let conn = connections.get(projectId);
  if (conn) return conn;

  conn = new ProjectConnection({ projectId, ...options });
  connections.set(projectId, conn);
  await conn.connect();
  return conn;
}

/**
 * Disconnect and remove a project connection.
 */
export function disconnectProject(projectId: string): void {
  const conn = connections.get(projectId);
  if (conn) {
    conn.disconnect();
    connections.delete(projectId);
  }
}

/**
 * Disconnect all project connections. Call on CLI exit.
 */
export function disconnectAll(): void {
  for (const [id, conn] of connections) {
    conn.disconnect();
    connections.delete(id);
  }
}
