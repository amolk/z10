/**
 * C4. Tests for the initial sync endpoint logic.
 *
 * Tests that getCanonicalDOM + getCanonicalHTML + getCurrentTxId work
 * together correctly for the sync use case: returning full HTML with
 * all metadata plus current txId for client bootstrapping.
 *
 * Uses the canonical DOM manager directly (no Next.js HTTP layer).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  configureCanonicalDOM,
  getCanonicalDOM,
  getCanonicalHTML,
  getCurrentTxId,
  executeTransaction,
  shutdownCanonicalDOM,
} from '../../web/src/lib/canonical-dom.js';
import { buildManifest } from '../../src/dom/validator.js';

describe('C4: Initial Sync Endpoint', () => {
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

  it('returns full HTML with z10 metadata preserved', async () => {
    const html = '<div data-z10-id="card" data-z10-ts-node="3" data-z10-ts-tree="3"><span data-z10-id="title" data-z10-ts-node="2" data-z10-ts-tree="2">Hello</span></div>';
    await getCanonicalDOM('sync-1', async () => html);

    const syncHtml = getCanonicalHTML('sync-1');
    expect(syncHtml).toContain('data-z10-id="card"');
    expect(syncHtml).toContain('data-z10-id="title"');
    expect(syncHtml).toContain('data-z10-ts-node');
    expect(syncHtml).toContain('data-z10-ts-tree');
    expect(syncHtml).toContain('Hello');
  });

  it('returns txId reflecting current state', async () => {
    const html = '<div data-z10-id="card" data-z10-ts-node="5" data-z10-ts-tree="5"><span data-z10-id="title" data-z10-ts-node="5" data-z10-ts-tree="5">X</span></div>';
    await getCanonicalDOM('sync-2', async () => html);

    const txId = getCurrentTxId('sync-2');
    expect(txId).toBeGreaterThanOrEqual(5);
  });

  it('txId advances after a committed transaction', async () => {
    const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Old</span></div>';
    const dom = await getCanonicalDOM('sync-3', async () => html);

    const txIdBefore = getCurrentTxId('sync-3')!;

    const manifest = buildManifest(dom.rootElement.firstElementChild!);
    await executeTransaction(
      'sync-3',
      "document.querySelector('span').textContent = 'New';",
      'card',
      manifest,
    );

    const txIdAfter = getCurrentTxId('sync-3')!;
    expect(txIdAfter).toBeGreaterThan(txIdBefore);

    // HTML should reflect the committed change
    const syncHtml = getCanonicalHTML('sync-3');
    expect(syncHtml).toContain('New');
  });

  it('bootstraps untagged HTML and includes metadata in response', async () => {
    const html = '<div><p>Plain HTML</p></div>';
    await getCanonicalDOM('sync-4', async () => html);

    const syncHtml = getCanonicalHTML('sync-4');
    // After bootstrap, elements should have data-z10-id and data-z10-ts-*
    expect(syncHtml).toContain('data-z10-id');
    expect(syncHtml).toContain('data-z10-ts-node');
    expect(syncHtml).toContain('Plain HTML');

    const txId = getCurrentTxId('sync-4');
    expect(txId).toBeGreaterThanOrEqual(0);
  });

  it('returns empty HTML and txId 0 for empty project', async () => {
    await getCanonicalDOM('sync-5', async () => '');

    const syncHtml = getCanonicalHTML('sync-5');
    expect(syncHtml).toBe('');

    const txId = getCurrentTxId('sync-5');
    expect(txId).toBeGreaterThanOrEqual(0);
  });

  it('returns null for non-existent project (not loaded)', () => {
    expect(getCanonicalHTML('sync-missing')).toBeNull();
    expect(getCurrentTxId('sync-missing')).toBeNull();
  });

  it('multiple syncs return consistent state', async () => {
    const html = '<div data-z10-id="root" data-z10-ts-node="2" data-z10-ts-tree="2"><span data-z10-id="child" data-z10-ts-node="2" data-z10-ts-tree="2">Text</span></div>';
    await getCanonicalDOM('sync-6', async () => html);

    const html1 = getCanonicalHTML('sync-6');
    const txId1 = getCurrentTxId('sync-6');
    const html2 = getCanonicalHTML('sync-6');
    const txId2 = getCurrentTxId('sync-6');

    expect(html1).toBe(html2);
    expect(txId1).toBe(txId2);
  });
});
