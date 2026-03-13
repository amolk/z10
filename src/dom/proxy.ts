/**
 * B1-B4. Local Proxy — the CLI/sidecar layer on top of Phase A's engine.
 *
 * B1. CLI DOM replica — long-lived happy-dom instance kept in sync via patches.
 * B2. Read tickets + getSubtree — snapshot subtrees with timestamp manifests.
 * B3. Local validation + submitCode — validate locally before forwarding to server.
 * B4. refreshSubtree — check if subtree changed since ticket was issued.
 *
 * This module is the "local proxy" that sits between agents/CLI and the
 * transaction engine. It can run standalone (offline mode) or forward
 * validated transactions to the server.
 *
 * §8.1–8.8
 */

import { Window } from 'happy-dom';
import { LamportClock } from './clock.js';
import { TransactionEngine, type TransactionResult, type TransactionEngineOptions } from './transaction.js';
import { bootstrapDocument, type BootstrapOptions } from './bootstrap.js';
import { replayPatch } from './patch-replay.js';
import { stripForAgent } from './strip.js';
import { buildManifest, type TimestampManifest } from './validator.js';
import { getTimestamp, TS_TREE } from './timestamps.js';
import type { PatchEnvelope } from './patch-serialize.js';

// ── Ticket system (B2) ──

export interface ReadTicket {
  ticketId: string;
  subtreeRootNid: string;
  manifest: TimestampManifest;
  createdAt: number;
  used: boolean;
}

interface TicketStore {
  tickets: Map<string, ReadTicket>;
  counter: number;
}

const DEFAULT_TICKET_TTL_MS = 60_000; // 60 seconds

// ── Subtree result types ──

export interface SubtreeResult {
  html: string;
  ticketId: string;
}

export interface RefreshResult {
  changed: boolean;
  html?: string;
  newTicketId?: string;
}

// ── Submit result types ──

export interface SubmitSuccess {
  status: 'committed';
  txId: number;
  timestamp: number;
  patch: PatchEnvelope;
  html: string;
  newTicketId: string;
}

export interface SubmitRejected {
  status: 'rejected';
  reason: string;
  conflicts?: unknown[];
  error?: string;
  /** Fresh HTML + new ticket on rejection for easy retry */
  html: string;
  newTicketId: string;
}

export type SubmitResult = SubmitSuccess | SubmitRejected;

// ── Local Proxy ──

export interface LocalProxyOptions extends TransactionEngineOptions {
  ticketTtlMs?: number;
  bootstrapOptions?: BootstrapOptions;
}

export class LocalProxy {
  private window: InstanceType<typeof Window>;
  private document: Document;
  private rootElement: Element;
  private engine: TransactionEngine;
  private clock: LamportClock;
  private ticketStore: TicketStore;
  private ticketTtlMs: number;
  private lastSeenTxId: number = 0;
  private gcInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: LocalProxyOptions = {}) {
    const { ticketTtlMs = DEFAULT_TICKET_TTL_MS, bootstrapOptions, ...engineOptions } = options;

    this.window = new Window();
    this.document = this.window.document as unknown as Document;
    this.clock = new LamportClock();
    this.ticketTtlMs = ticketTtlMs;
    this.ticketStore = { tickets: new Map(), counter: 0 };

    // Create root element
    this.document.body.innerHTML = '<div data-z10-id="root"></div>';
    this.rootElement = this.document.body.firstElementChild as unknown as Element;

    this.engine = new TransactionEngine(this.rootElement, this.clock, engineOptions);

    // Start ticket GC
    this.gcInterval = setInterval(() => this.gcTickets(), this.ticketTtlMs);
  }

  // ── B1. DOM Replica ──

  /**
   * Load a full document HTML into the local DOM replica.
   * Called on startup or full resync. Bootstraps if needed.
   */
  loadDocument(html: string, currentTxId: number = 0): void {
    this.rootElement.innerHTML = html;
    this.lastSeenTxId = currentTxId;

    // Advance clock to at least the current transaction ID
    // so future ticks produce timestamps higher than existing ones
    if (currentTxId > 0) {
      this.clock.receive(currentTxId);
    }

    // Bootstrap if the document lacks z10 metadata
    const firstChild = this.rootElement.firstElementChild;
    if (firstChild && !firstChild.getAttribute('data-z10-id')) {
      bootstrapDocument(this.rootElement, this.clock);
    }

    // Re-create transaction engine with fresh DOM state
    this.engine = new TransactionEngine(this.rootElement, this.clock);
  }

  /**
   * Apply a patch from the server to keep the local DOM in sync.
   * Uses replayPatch (A15).
   */
  applyPatch(patch: PatchEnvelope): void {
    replayPatch(patch.ops, this.rootElement);
    if (patch.txId > this.lastSeenTxId) {
      this.lastSeenTxId = patch.txId;
    }
  }

  /**
   * Apply multiple patches (e.g., after reconnection).
   */
  applyPatches(patches: PatchEnvelope[]): void {
    for (const patch of patches) {
      this.applyPatch(patch);
    }
  }

  /** Get the full DOM HTML (with all metadata). */
  getFullHtml(): string {
    return this.rootElement.innerHTML;
  }

  /** Get the current lastSeenTxId. */
  get currentTxId(): number {
    return this.lastSeenTxId;
  }

  // ── B2. Read Tickets + getSubtree ──

  /**
   * Get a subtree snapshot for agent consumption.
   * Returns stripped HTML (no timestamps) + a ticket ID for later submitCode.
   * The ticket stores the manifest (timestamp snapshot) for validation.
   */
  getSubtree(selector: string, depth?: number): SubtreeResult {
    // Find the subtree root
    const subtreeRoot = this.rootElement.querySelector(selector);
    if (!subtreeRoot) {
      throw new Error(`Subtree not found: ${selector}`);
    }

    // Apply depth limit if specified
    let targetRoot = subtreeRoot as Element;
    if (depth !== undefined && depth >= 0) {
      targetRoot = this.cloneWithDepthLimit(subtreeRoot as Element, depth);
    }

    // Build manifest from live DOM (before stripping)
    const manifest = buildManifest(subtreeRoot as Element);

    // Strip timestamps for agent consumption
    const stripped = stripForAgent(targetRoot);
    const html = stripped.outerHTML;

    // Create ticket
    const nid = (subtreeRoot as Element).getAttribute('data-z10-id');
    if (!nid) {
      throw new Error('Subtree root has no data-z10-id');
    }

    const ticketId = this.createTicket(nid, manifest);

    return { html, ticketId };
  }

  // ── B3. Local Validation + submitCode ──

  /**
   * Submit code for execution against a subtree.
   * Validates locally first (free, no network). On local reject,
   * returns fresh HTML + new ticket for retry.
   */
  async submitCode(code: string, ticketId: string): Promise<SubmitResult> {
    // Look up ticket
    const ticket = this.ticketStore.tickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Invalid or expired ticket: ${ticketId}`);
    }
    if (ticket.used) {
      throw new Error(`Ticket already used: ${ticketId}`);
    }

    // Mark ticket as used (single-use)
    ticket.used = true;

    // Run transaction engine locally
    const result = await this.engine.execute(code, ticket.subtreeRootNid, ticket.manifest);

    if (result.status === 'committed') {
      // Update lastSeenTxId
      this.lastSeenTxId = result.txId;

      // Create fresh ticket for the updated subtree
      const subtreeRoot = this.findByNid(ticket.subtreeRootNid);
      const freshManifest = subtreeRoot ? buildManifest(subtreeRoot) : ticket.manifest;
      const freshTicketId = this.createTicket(ticket.subtreeRootNid, freshManifest);

      // Get fresh stripped HTML
      const html = subtreeRoot ? stripForAgent(subtreeRoot).outerHTML : '';

      return {
        status: 'committed',
        txId: result.txId,
        timestamp: result.timestamp,
        patch: result.patch,
        html,
        newTicketId: freshTicketId,
      };
    }

    // Rejected — serve fresh HTML + new ticket for retry
    const subtreeRoot = this.findByNid(ticket.subtreeRootNid);
    const freshManifest = subtreeRoot ? buildManifest(subtreeRoot) : ticket.manifest;
    const freshTicketId = this.createTicket(ticket.subtreeRootNid, freshManifest);
    const html = subtreeRoot ? stripForAgent(subtreeRoot).outerHTML : '';

    return {
      status: 'rejected',
      reason: result.reason,
      conflicts: result.reason === 'conflict' ? result.conflicts : undefined,
      error: result.error?.message,
      html,
      newTicketId: freshTicketId,
    };
  }

  // ── B4. refreshSubtree ──

  /**
   * Check if a subtree has changed since the ticket was issued.
   * Uses data-z10-ts-tree for fast comparison.
   */
  refreshSubtree(ticketId: string): RefreshResult {
    const ticket = this.ticketStore.tickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Invalid or expired ticket: ${ticketId}`);
    }

    const subtreeRoot = this.findByNid(ticket.subtreeRootNid);
    if (!subtreeRoot) {
      // Node was deleted — definitely changed
      return { changed: true };
    }

    // Compare tree timestamp
    const manifestEntry = ticket.manifest.nodes.get(ticket.subtreeRootNid);
    const manifestTreeTs = manifestEntry?.[TS_TREE] ?? 0;
    const liveTreeTs = getTimestamp(subtreeRoot, TS_TREE);

    if (liveTreeTs <= manifestTreeTs) {
      return { changed: false };
    }

    // Changed — return fresh HTML + new ticket
    const freshManifest = buildManifest(subtreeRoot);
    const freshTicketId = this.createTicket(ticket.subtreeRootNid, freshManifest);
    const stripped = stripForAgent(subtreeRoot);

    return {
      changed: true,
      html: stripped.outerHTML,
      newTicketId: freshTicketId,
    };
  }

  // ── Internal helpers ──

  private findByNid(nid: string): Element | null {
    if (this.rootElement.getAttribute('data-z10-id') === nid) return this.rootElement;
    return this.rootElement.querySelector(`[data-z10-id="${nid}"]`);
  }

  private createTicket(subtreeRootNid: string, manifest: TimestampManifest): string {
    const ticketId = `t${++this.ticketStore.counter}`;
    this.ticketStore.tickets.set(ticketId, {
      ticketId,
      subtreeRootNid,
      manifest,
      createdAt: Date.now(),
      used: false,
    });
    return ticketId;
  }

  private gcTickets(): void {
    const now = Date.now();
    for (const [id, ticket] of this.ticketStore.tickets) {
      if (ticket.used || now - ticket.createdAt > this.ticketTtlMs) {
        this.ticketStore.tickets.delete(id);
      }
    }
  }

  /**
   * Clone an element with a depth limit.
   * depth=0: just the element, no children.
   * depth=1: element + direct children.
   * etc.
   */
  private cloneWithDepthLimit(el: Element, maxDepth: number): Element {
    const clone = el.cloneNode(false) as Element;
    if (maxDepth <= 0) return clone;

    for (let i = 0; i < el.children.length; i++) {
      const childClone = this.cloneWithDepthLimit(el.children[i] as Element, maxDepth - 1);
      clone.appendChild(childClone);
    }

    // Also copy text nodes at this level
    for (let i = 0; i < el.childNodes.length; i++) {
      const node = el.childNodes[i];
      if (node.nodeType === 3) { // Text node
        clone.appendChild(node.cloneNode(false));
      }
    }

    return clone;
  }

  /** Clean up resources. */
  dispose(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
    this.ticketStore.tickets.clear();
    this.window.close();
  }
}
