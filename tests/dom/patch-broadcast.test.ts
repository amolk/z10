/**
 * C3. Tests for patch broadcast — pub/sub for committed patch envelopes.
 *
 * Tests the broadcast module itself and its integration with the canonical
 * DOM manager (patches emitted on commit).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { patchBroadcast } from '../../web/src/lib/patch-broadcast.js';
import {
  configureCanonicalDOM,
  getCanonicalDOM,
  executeTransaction,
  shutdownCanonicalDOM,
} from '../../web/src/lib/canonical-dom.js';
import { buildManifest } from '../../src/dom/validator.js';
import type { PatchEnvelope } from '../../src/dom/patch-serialize.js';

describe('C3: Patch Broadcast', () => {
  // ── Unit tests for the broadcast module ──

  describe('PatchBroadcast pub/sub', () => {
    it('delivers patches to subscribers', () => {
      const received: PatchEnvelope[] = [];
      const unsub = patchBroadcast.subscribe('proj-bc-1', (p) => received.push(p));

      const patch: PatchEnvelope = { txId: 1, timestamp: 1, ops: [] };
      patchBroadcast.emit('proj-bc-1', patch);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(patch);
      unsub();
    });

    it('only delivers to the correct project', () => {
      const received: PatchEnvelope[] = [];
      const unsub = patchBroadcast.subscribe('proj-bc-2a', (p) => received.push(p));

      patchBroadcast.emit('proj-bc-2b', { txId: 1, timestamp: 1, ops: [] });

      expect(received).toHaveLength(0);
      unsub();
    });

    it('supports multiple subscribers per project', () => {
      const received1: PatchEnvelope[] = [];
      const received2: PatchEnvelope[] = [];
      const unsub1 = patchBroadcast.subscribe('proj-bc-3', (p) => received1.push(p));
      const unsub2 = patchBroadcast.subscribe('proj-bc-3', (p) => received2.push(p));

      patchBroadcast.emit('proj-bc-3', { txId: 1, timestamp: 1, ops: [] });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      unsub1();
      unsub2();
    });

    it('unsubscribe stops delivery', () => {
      const received: PatchEnvelope[] = [];
      const unsub = patchBroadcast.subscribe('proj-bc-4', (p) => received.push(p));

      patchBroadcast.emit('proj-bc-4', { txId: 1, timestamp: 1, ops: [] });
      unsub();
      patchBroadcast.emit('proj-bc-4', { txId: 2, timestamp: 2, ops: [] });

      expect(received).toHaveLength(1);
    });

    it('reports listener count', () => {
      expect(patchBroadcast.listenerCount('proj-bc-5')).toBe(0);
      const unsub = patchBroadcast.subscribe('proj-bc-5', () => {});
      expect(patchBroadcast.listenerCount('proj-bc-5')).toBe(1);
      unsub();
      expect(patchBroadcast.listenerCount('proj-bc-5')).toBe(0);
    });

    it('does not throw when a listener throws', () => {
      const received: PatchEnvelope[] = [];
      const unsub1 = patchBroadcast.subscribe('proj-bc-6', () => { throw new Error('bad'); });
      const unsub2 = patchBroadcast.subscribe('proj-bc-6', (p) => received.push(p));

      // Should not throw, and second listener should still receive
      patchBroadcast.emit('proj-bc-6', { txId: 1, timestamp: 1, ops: [] });

      expect(received).toHaveLength(1);
      unsub1();
      unsub2();
    });
  });

  // ── Integration: canonical DOM commits → broadcast ──

  describe('Integration with canonical DOM', () => {
    beforeEach(async () => {
      await shutdownCanonicalDOM();
      configureCanonicalDOM({
        ttlMs: 60000,
        cleanupIntervalMs: 60000,
        persistEveryNCommits: 100,
      });
    });

    afterEach(async () => {
      await shutdownCanonicalDOM();
    });

    it('broadcasts patch on successful commit', async () => {
      const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Old</span></div>';
      const dom = await getCanonicalDOM('proj-bc-int-1', async () => html);

      const received: PatchEnvelope[] = [];
      const unsub = patchBroadcast.subscribe('proj-bc-int-1', (p) => received.push(p));

      const manifest = buildManifest(dom.rootElement.firstElementChild!);
      const result = await executeTransaction(
        'proj-bc-int-1',
        "document.querySelector('span').textContent = 'New';",
        'card',
        manifest,
      );

      expect(result.status).toBe('committed');
      expect(received).toHaveLength(1);
      expect(received[0].txId).toBe(result.txId);
      expect(received[0].ops.length).toBeGreaterThan(0);

      unsub();
    });

    it('does not broadcast on rejected transaction', async () => {
      const html = '<div data-z10-id="card" data-z10-ts-node="5" data-z10-ts-children="5" data-z10-ts-text="5" data-z10-ts-tree="5"><span data-z10-id="title" data-z10-ts-node="5" data-z10-ts-children="5" data-z10-ts-text="5" data-z10-ts-tree="5">Text</span></div>';
      const dom = await getCanonicalDOM('proj-bc-int-2', async () => html);

      const received: PatchEnvelope[] = [];
      const unsub = patchBroadcast.subscribe('proj-bc-int-2', (p) => received.push(p));

      // Build manifest with old timestamps (stale)
      const manifest = buildManifest(dom.rootElement.firstElementChild!);

      // First transaction to advance timestamps
      await executeTransaction(
        'proj-bc-int-2',
        "document.querySelector('span').textContent = 'Changed';",
        'card',
        manifest,
      );

      const countAfterFirst = received.length;

      // Second transaction with stale manifest should be rejected
      const result = await executeTransaction(
        'proj-bc-int-2',
        "document.querySelector('span').textContent = 'Conflict';",
        'card',
        manifest, // stale manifest
      );

      expect(result.status).toBe('rejected');
      expect(received.length).toBe(countAfterFirst); // No new patches

      unsub();
    });

    it('broadcasts patches with correct ops for text change', async () => {
      const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="label" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Original</span></div>';
      const dom = await getCanonicalDOM('proj-bc-int-3', async () => html);

      const received: PatchEnvelope[] = [];
      const unsub = patchBroadcast.subscribe('proj-bc-int-3', (p) => received.push(p));

      const manifest = buildManifest(dom.rootElement.firstElementChild!);
      const result = await executeTransaction(
        'proj-bc-int-3',
        "document.querySelector('span').textContent = 'Updated';",
        'card',
        manifest,
      );

      expect(result.status).toBe('committed');
      expect(received).toHaveLength(1);
      expect(received[0].ops.length).toBeGreaterThan(0);

      unsub();
    });
  });
});
