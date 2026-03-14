/**
 * C5. Tests for reconnection protocol logic.
 *
 * Tests the ring buffer replay and gap detection that powers the
 * reconnection protocol in the patches SSE endpoint.
 * The endpoint uses getPatches(projectId, lastSeenTxId) which returns:
 *   - PatchEnvelope[] if patches are available (replay)
 *   - null if gap too large (triggers full resync)
 *   - [] if client is already up to date
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  configureCanonicalDOM,
  getCanonicalDOM,
  executeTransaction,
  getPatches,
  getCurrentTxId,
  getCanonicalHTML,
  shutdownCanonicalDOM,
} from '../../web/src/lib/canonical-dom.js';
import { buildManifest } from '../../src/dom/validator.js';

describe('C5: Reconnection Protocol', () => {
  beforeEach(async () => {
    await shutdownCanonicalDOM();
    configureCanonicalDOM({
      ttlMs: 60000,
      cleanupIntervalMs: 60000,
      persistEveryNCommits: 100,
      ringBufferCapacity: 5, // Small buffer to test gap detection
    });
  });

  afterEach(async () => {
    await shutdownCanonicalDOM();
  });

  async function setupAndCommit(projectId: string, textValues: string[]) {
    const html = '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Init</span></div>';
    const dom = await getCanonicalDOM(projectId, async () => html);

    const txIds: number[] = [];
    for (const text of textValues) {
      const manifest = buildManifest(dom.rootElement.firstElementChild!);
      const result = await executeTransaction(
        projectId,
        `document.querySelector('span').textContent = '${text}';`,
        'card',
        manifest,
      );
      expect(result.status).toBe('committed');
      txIds.push(result.txId);
    }
    return txIds;
  }

  it('replays missed patches when client reconnects with lastSeenTxId', async () => {
    const txIds = await setupAndCommit('recon-1', ['A', 'B', 'C']);

    // Client last saw first commit, missed B and C
    const missed = getPatches('recon-1', txIds[0]);
    expect(missed).not.toBeNull();
    expect(missed!.length).toBe(2);
    expect(missed![0].txId).toBe(txIds[1]);
    expect(missed![1].txId).toBe(txIds[2]);
  });

  it('returns empty array when client is up to date', async () => {
    const txIds = await setupAndCommit('recon-2', ['A']);

    const missed = getPatches('recon-2', txIds[0]);
    expect(missed).not.toBeNull();
    expect(missed!.length).toBe(0);
  });

  it('returns all patches when client has lastSeenTxId=0', async () => {
    const txIds = await setupAndCommit('recon-3', ['A', 'B']);

    const all = getPatches('recon-3', 0);
    expect(all).not.toBeNull();
    expect(all!.length).toBe(2);
    expect(all![0].txId).toBe(txIds[0]);
    expect(all![1].txId).toBe(txIds[1]);
  });

  it('returns null (gap) when ring buffer has been overwritten', async () => {
    // Buffer capacity is 5. Commit 7 times to overflow.
    const txIds = await setupAndCommit('recon-4', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    // Client last saw the first commit — it's been evicted from the buffer
    const missed = getPatches('recon-4', txIds[0]);
    expect(missed).toBeNull(); // Gap — triggers full resync
  });

  it('provides full HTML for resync when gap detected', async () => {
    await setupAndCommit('recon-5', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    // When getPatches returns null, the endpoint sends full HTML + txId
    const missed = getPatches('recon-5', 1); // Very old txId
    expect(missed).toBeNull();

    // The fallback: full HTML and current txId are available
    const html = getCanonicalHTML('recon-5');
    const txId = getCurrentTxId('recon-5');
    expect(html).toContain('G'); // Latest state
    expect(txId).toBeGreaterThan(0);
  });

  it('recent patches available even after partial overflow', async () => {
    // Commit 7 times with capacity 5 — first 2 evicted, last 5 remain
    const txIds = await setupAndCommit('recon-6', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    // Client last saw E (txIds[4]) — F and G should be available
    const missed = getPatches('recon-6', txIds[4]);
    expect(missed).not.toBeNull();
    expect(missed!.length).toBe(2);
    expect(missed![0].txId).toBe(txIds[5]);
    expect(missed![1].txId).toBe(txIds[6]);
  });
});
