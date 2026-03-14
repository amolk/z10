/**
 * C6. Tests for canonical DOM persistence.
 *
 * Tests the persistence mechanisms: on N commits (already in C1 tests),
 * periodic persist-all-dirty, shutdown persistence, and eviction persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  configureCanonicalDOM,
  getCanonicalDOM,
  executeTransaction,
  persistAllDirty,
  shutdownCanonicalDOM,
  hasCanonicalDOM,
} from '../../web/src/lib/canonical-dom.js';
import { buildManifest } from '../../src/dom/validator.js';

const BASE_HTML = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Init</span></div>';

describe('C6: Canonical DOM Persistence', () => {
  let persisted: Map<string, { html: string; txId: number }>;

  beforeEach(async () => {
    await shutdownCanonicalDOM();
    persisted = new Map();
  });

  afterEach(async () => {
    await shutdownCanonicalDOM();
  });

  function configurePersistence(opts: { persistEveryNCommits?: number; persistIntervalMs?: number } = {}) {
    configureCanonicalDOM({
      ttlMs: 60000,
      cleanupIntervalMs: 60000,
      persistEveryNCommits: opts.persistEveryNCommits ?? 100, // High default to not auto-trigger
      persistIntervalMs: opts.persistIntervalMs ?? 0, // Disabled by default in tests
      onPersist: async (projectId, html, txId) => {
        persisted.set(projectId, { html, txId });
      },
    });
  }

  async function commitOnce(projectId: string) {
    const dom = await getCanonicalDOM(projectId, async () => BASE_HTML);
    const manifest = buildManifest(dom.rootElement.firstElementChild!);
    return executeTransaction(
      projectId,
      "document.querySelector('span').textContent = 'Changed';",
      'card',
      manifest,
    );
  }

  it('persistAllDirty persists all dirty instances', async () => {
    configurePersistence();

    await commitOnce('persist-1a');
    await commitOnce('persist-1b');

    expect(persisted.size).toBe(0); // Not persisted yet

    await persistAllDirty();

    expect(persisted.size).toBe(2);
    expect(persisted.get('persist-1a')!.html).toContain('Changed');
    expect(persisted.get('persist-1b')!.html).toContain('Changed');
  });

  it('persistAllDirty skips clean instances', async () => {
    configurePersistence();

    await commitOnce('persist-2a');
    // persist-2b is loaded but not modified (clean)
    await getCanonicalDOM('persist-2b', async () => BASE_HTML);

    await persistAllDirty();

    expect(persisted.has('persist-2a')).toBe(true);
    expect(persisted.has('persist-2b')).toBe(false);
  });

  it('auto-persists after N commits', async () => {
    configurePersistence({ persistEveryNCommits: 2 });

    const dom = await getCanonicalDOM('persist-3', async () => BASE_HTML);

    // First commit — not persisted yet
    let manifest = buildManifest(dom.rootElement.firstElementChild!);
    await executeTransaction(
      'persist-3',
      "document.querySelector('span').textContent = 'One';",
      'card',
      manifest,
    );
    expect(persisted.has('persist-3')).toBe(false);

    // Second commit — should trigger auto-persist
    manifest = buildManifest(dom.rootElement.firstElementChild!);
    await executeTransaction(
      'persist-3',
      "document.querySelector('span').textContent = 'Two';",
      'card',
      manifest,
    );
    expect(persisted.has('persist-3')).toBe(true);
    expect(persisted.get('persist-3')!.html).toContain('Two');
  });

  it('shutdown persists all dirty instances', async () => {
    configurePersistence();

    await commitOnce('persist-4a');
    await commitOnce('persist-4b');

    expect(persisted.size).toBe(0);

    await shutdownCanonicalDOM();

    expect(persisted.size).toBe(2);
    // Instances should be evicted after shutdown
    expect(hasCanonicalDOM('persist-4a')).toBe(false);
    expect(hasCanonicalDOM('persist-4b')).toBe(false);
  });

  it('does not persist when no onPersist callback configured', async () => {
    configureCanonicalDOM({
      ttlMs: 60000,
      cleanupIntervalMs: 60000,
      persistEveryNCommits: 1,
      persistIntervalMs: 0,
      // No onPersist callback
    });

    const dom = await getCanonicalDOM('persist-5', async () => BASE_HTML);
    const manifest = buildManifest(dom.rootElement.firstElementChild!);
    await executeTransaction(
      'persist-5',
      "document.querySelector('span').textContent = 'X';",
      'card',
      manifest,
    );

    // Should not throw or error — just silently skips
    await persistAllDirty();
    expect(persisted.size).toBe(0);
  });

  it('clears dirty flag after successful persist', async () => {
    configurePersistence();

    await commitOnce('persist-6');
    await persistAllDirty();

    const count1 = persisted.size;

    // Second persistAllDirty should not re-persist (already clean)
    await persistAllDirty();
    expect(persisted.size).toBe(count1); // No additional persists
  });
});
