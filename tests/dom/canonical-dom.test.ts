/**
 * C1. Tests for server canonical DOM manager.
 *
 * Tests the lifecycle: load → bootstrap → execute → persist → evict.
 * Uses happy-dom directly (no Next.js dependency).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  configureCanonicalDOM,
  getCanonicalDOM,
  loadCanonicalDOM,
  executeTransaction,
  getCanonicalHTML,
  getCurrentTxId,
  getPatches,
  persistCanonicalDOM,
  evictCanonicalDOM,
  hasCanonicalDOM,
  activeInstanceCount,
  shutdownCanonicalDOM,
} from '../../web/src/lib/canonical-dom.js';
import { buildManifest } from '../../src/dom/validator.js';

describe('C1: Canonical DOM Manager', () => {
  beforeEach(async () => {
    // Clean up any leftover instances
    await shutdownCanonicalDOM();
    configureCanonicalDOM({
      ttlMs: 60000,
      cleanupIntervalMs: 60000, // Don't auto-cleanup during tests
      persistEveryNCommits: 100, // Don't auto-persist during tests
    });
  });

  afterEach(async () => {
    await shutdownCanonicalDOM();
  });

  it('loads HTML into a canonical DOM instance', async () => {
    const html = '<div data-z10-id="root"><span data-z10-id="title">Hello</span></div>';
    const dom = await getCanonicalDOM('proj-1', async () => html);

    expect(dom.projectId).toBe('proj-1');
    expect(dom.rootElement).toBeDefined();
    expect(hasCanonicalDOM('proj-1')).toBe(true);
    expect(activeInstanceCount()).toBe(1);
  });

  it('returns cached instance on subsequent calls', async () => {
    const html = '<div>Test</div>';
    const dom1 = await getCanonicalDOM('proj-2', async () => html);
    const dom2 = await getCanonicalDOM('proj-2', async () => 'different');

    expect(dom1).toBe(dom2); // Same object reference
  });

  it('bootstraps document lacking z10 metadata', async () => {
    const html = '<div><span>No metadata</span></div>';
    const dom = await getCanonicalDOM('proj-3', async () => html);

    // After bootstrap, elements should have data-z10-id
    const firstChild = dom.rootElement.firstElementChild;
    expect(firstChild?.getAttribute('data-z10-id')).toBeTruthy();
    expect(dom.dirty).toBe(true); // Bootstrap marks as dirty
  });

  it('preserves existing z10 metadata without re-bootstrapping', async () => {
    const html = '<div data-z10-id="card" data-z10-ts-node="5" data-z10-ts-tree="5"><span data-z10-id="title" data-z10-ts-node="3" data-z10-ts-tree="3">Hello</span></div>';
    const dom = await getCanonicalDOM('proj-4', async () => html);

    // Clock should be at least 5 (from existing timestamps)
    expect(dom.clock.value).toBeGreaterThanOrEqual(5);
    expect(dom.dirty).toBe(false);
  });

  it('executes a transaction against the canonical DOM', async () => {
    const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Old</span></div>';
    const dom = await getCanonicalDOM('proj-5', async () => html);

    const manifest = buildManifest(dom.rootElement.firstElementChild!);
    const result = await executeTransaction(
      'proj-5',
      "document.querySelector('span').textContent = 'New';",
      'card',
      manifest,
    );

    expect(result.status).toBe('committed');
    expect(dom.dirty).toBe(true);
    expect(dom.currentTxId).toBeGreaterThan(1);

    const updatedHtml = getCanonicalHTML('proj-5');
    expect(updatedHtml).toContain('New');
  });

  it('tracks currentTxId after commits', async () => {
    const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">X</span></div>';
    await getCanonicalDOM('proj-6', async () => html);

    const txId1 = getCurrentTxId('proj-6');
    expect(txId1).toBeGreaterThanOrEqual(1);
  });

  it('stores patches in ring buffer', async () => {
    const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">X</span></div>';
    const dom = await getCanonicalDOM('proj-7', async () => html);

    const manifest = buildManifest(dom.rootElement.firstElementChild!);
    await executeTransaction(
      'proj-7',
      "document.querySelector('span').textContent = 'Y';",
      'card',
      manifest,
    );

    // Use afterTxId=0 to get all patches (avoids ring buffer gap detection)
    const patches = getPatches('proj-7', 0);
    expect(patches).not.toBeNull();
    expect(patches!.length).toBeGreaterThanOrEqual(1);
  });

  it('persists dirty state via callback', async () => {
    let persistedHtml = '';
    let persistedTxId = 0;

    configureCanonicalDOM({
      ttlMs: 60000,
      cleanupIntervalMs: 60000,
      onPersist: async (_projectId, html, txId) => {
        persistedHtml = html;
        persistedTxId = txId;
      },
    });

    const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">X</span></div>';
    const dom = await getCanonicalDOM('proj-8', async () => html);

    const manifest = buildManifest(dom.rootElement.firstElementChild!);
    await executeTransaction(
      'proj-8',
      "document.querySelector('span').textContent = 'Persisted';",
      'card',
      manifest,
    );

    await persistCanonicalDOM('proj-8');

    expect(persistedHtml).toContain('Persisted');
    expect(persistedTxId).toBeGreaterThan(0);
    expect(dom.dirty).toBe(false);
  });

  it('evicts and closes window on evict', async () => {
    const html = '<div>Test</div>';
    await getCanonicalDOM('proj-9', async () => html);

    expect(hasCanonicalDOM('proj-9')).toBe(true);
    await evictCanonicalDOM('proj-9');
    expect(hasCanonicalDOM('proj-9')).toBe(false);
    expect(activeInstanceCount()).toBe(0);
  });

  it('returns null for non-existent projects', () => {
    expect(getCanonicalHTML('nonexistent')).toBeNull();
    expect(getCurrentTxId('nonexistent')).toBeNull();
    expect(getPatches('nonexistent', 0)).toBeNull();
  });

  it('throws on transaction against non-existent project', async () => {
    const manifest = { nodes: new Map() };
    await expect(
      executeTransaction('nonexistent', 'code', null, manifest),
    ).rejects.toThrow('No canonical DOM');
  });

  it('handles empty HTML gracefully', async () => {
    const dom = await getCanonicalDOM('proj-empty', async () => '');
    expect(dom.rootElement).toBeDefined();
    expect(getCanonicalHTML('proj-empty')).toBe('');
  });
});
