/**
 * B5. CLI SSE patch consumer.
 *
 * Connects to the server's SSE patch stream (GET /api/projects/:id/patches).
 * Replays patches against the CLI's LocalProxy DOM replica via replayPatch.
 * Handles reconnection with lastSeenTxId for missed patch recovery.
 * On gap (resync event), reloads full document into LocalProxy.
 *
 * §7.4, §8.1
 */

import type { LocalProxy } from '../dom/proxy.js';
import type { PatchEnvelope } from '../dom/patch-serialize.js';

export interface PatchStreamOptions {
  /** Base URL of the z10 server. */
  baseUrl: string;
  /** Auth token for API requests. */
  authToken?: string;
  /** Project ID to subscribe to. */
  projectId: string;
  /** LocalProxy to apply patches to. */
  proxy: LocalProxy;
  /** Reconnect delay in ms (doubles on each retry, capped at maxReconnectDelay). Default: 1000. */
  reconnectDelay?: number;
  /** Max reconnect delay in ms. Default: 30000. */
  maxReconnectDelay?: number;
  /** Callback on successful connection. */
  onConnect?: (txId: number) => void;
  /** Callback on patch received. */
  onPatch?: (patch: PatchEnvelope) => void;
  /** Callback on resync (full DOM reload). */
  onResync?: (txId: number) => void;
  /** Callback on error. */
  onError?: (error: Error) => void;
  /** Callback on disconnect. */
  onDisconnect?: () => void;
}

export type PatchStreamEvent =
  | { type: 'connected'; projectId: string; txId: number }
  | { type: 'patch'; patch: PatchEnvelope }
  | { type: 'resync'; html: string; txId: number }
  | { type: 'heartbeat' };

/**
 * Parse a single SSE `data:` line into a PatchStreamEvent.
 */
export function parseSseEvent(data: string): PatchStreamEvent | null {
  try {
    return JSON.parse(data) as PatchStreamEvent;
  } catch {
    return null;
  }
}

/**
 * Process a stream of SSE events, yielding parsed PatchStreamEvents.
 * Handles SSE line protocol: lines starting with "data: " contain JSON.
 */
export async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<PatchStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const parts = buffer.split('\n\n');
    buffer = parts.pop()!; // Keep incomplete event in buffer

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          const event = parseSseEvent(line.slice(6));
          if (event) yield event;
        }
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    for (const line of buffer.split('\n')) {
      if (line.startsWith('data: ')) {
        const event = parseSseEvent(line.slice(6));
        if (event) yield event;
      }
    }
  }
}

/**
 * Apply a PatchStreamEvent to a LocalProxy.
 * Returns true if the event was meaningful (not a heartbeat).
 */
export function applyStreamEvent(
  proxy: LocalProxy,
  event: PatchStreamEvent,
): boolean {
  switch (event.type) {
    case 'patch':
      proxy.applyPatch(event.patch);
      return true;
    case 'resync':
      proxy.loadDocument(event.html, event.txId);
      return true;
    case 'connected':
    case 'heartbeat':
      return false;
  }
}

/**
 * Manages a persistent SSE connection to the server's patch stream.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export class PatchStream {
  private controller: AbortController | null = null;
  private running = false;
  private currentDelay: number;
  private readonly options: Required<
    Pick<PatchStreamOptions, 'baseUrl' | 'projectId' | 'reconnectDelay' | 'maxReconnectDelay'>
  > & PatchStreamOptions;

  constructor(options: PatchStreamOptions) {
    this.options = {
      reconnectDelay: 1000,
      maxReconnectDelay: 30_000,
      ...options,
    };
    this.currentDelay = this.options.reconnectDelay;
  }

  /** Start the SSE connection. Non-blocking — runs in background. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  /** Stop the SSE connection and prevent reconnection. */
  stop(): void {
    this.running = false;
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  /** Whether the stream is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  private async connect(): Promise<void> {
    if (!this.running) return;

    this.controller = new AbortController();
    const { baseUrl, projectId, authToken, proxy } = this.options;

    const lastSeenTxId = proxy.currentTxId;
    const url = `${baseUrl}/api/projects/${projectId}/patches?lastSeenTxId=${lastSeenTxId}`;

    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: this.controller.signal,
      });

      if (!res.ok) {
        throw new Error(`SSE connection failed (${res.status}): ${await res.text()}`);
      }

      // Reset reconnect delay on successful connection
      this.currentDelay = this.options.reconnectDelay;

      const reader = res.body!.getReader();

      for await (const event of parseSseStream(reader)) {
        if (!this.running) break;

        switch (event.type) {
          case 'connected':
            this.options.onConnect?.(event.txId);
            break;
          case 'patch':
            proxy.applyPatch(event.patch);
            this.options.onPatch?.(event.patch);
            break;
          case 'resync':
            proxy.loadDocument(event.html, event.txId);
            this.options.onResync?.(event.txId);
            break;
          case 'heartbeat':
            // Keep-alive, no action needed
            break;
        }
      }
    } catch (err: unknown) {
      if (!this.running) return; // Intentional stop
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === 'AbortError') return; // Intentional abort
      this.options.onError?.(error);
    }

    // Stream ended — reconnect with backoff
    this.options.onDisconnect?.();
    if (this.running) {
      const delay = this.currentDelay;
      this.currentDelay = Math.min(this.currentDelay * 2, this.options.maxReconnectDelay);
      setTimeout(() => this.connect(), delay);
    }
  }
}
