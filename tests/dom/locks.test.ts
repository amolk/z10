import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { SubtreeLockManager } from '../../src/dom/locks.js';

let window: InstanceType<typeof Window>;
let document: Document;
let root: Element;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
  document.body.innerHTML = `
    <div data-z10-id="root">
      <div data-z10-id="a">
        <div data-z10-id="a1"></div>
        <div data-z10-id="a2"></div>
      </div>
      <div data-z10-id="b">
        <div data-z10-id="b1"></div>
      </div>
    </div>
  `;
  root = document.querySelector('[data-z10-id="root"]') as unknown as Element;
});

describe('SubtreeLockManager', () => {
  it('acquires and releases a lock', async () => {
    const mgr = new SubtreeLockManager(root);
    const release = await mgr.acquire('a');
    expect(mgr.activeCount).toBe(1);
    release();
    expect(mgr.activeCount).toBe(0);
  });

  it('allows non-overlapping locks in parallel', async () => {
    const mgr = new SubtreeLockManager(root);
    const releaseA = await mgr.acquire('a');
    const releaseB = await mgr.acquire('b');
    expect(mgr.activeCount).toBe(2);
    releaseA();
    releaseB();
  });

  it('serializes overlapping locks (same node)', async () => {
    const mgr = new SubtreeLockManager(root);
    const release1 = await mgr.acquire('a');

    let lock2Granted = false;
    const lock2Promise = mgr.acquire('a').then((release) => {
      lock2Granted = true;
      return release;
    });

    // Lock 2 should be pending
    await new Promise((r) => setTimeout(r, 10));
    expect(lock2Granted).toBe(false);
    expect(mgr.pendingCount).toBe(1);

    // Release first lock — second should be granted
    release1();
    const release2 = await lock2Promise;
    expect(lock2Granted).toBe(true);
    release2();
  });

  it('serializes ancestor/descendant locks', async () => {
    const mgr = new SubtreeLockManager(root);
    const releaseParent = await mgr.acquire('a');

    let childGranted = false;
    const childPromise = mgr.acquire('a1').then((release) => {
      childGranted = true;
      return release;
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(childGranted).toBe(false);

    releaseParent();
    const releaseChild = await childPromise;
    expect(childGranted).toBe(true);
    releaseChild();
  });

  it('document-level lock blocks all others', async () => {
    const mgr = new SubtreeLockManager(root);
    const releaseDoc = await mgr.acquire(null);

    let subtreeGranted = false;
    const subtreePromise = mgr.acquire('a').then((release) => {
      subtreeGranted = true;
      return release;
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(subtreeGranted).toBe(false);

    releaseDoc();
    const releaseA = await subtreePromise;
    expect(subtreeGranted).toBe(true);
    releaseA();
  });

  it('times out when lock cannot be acquired', async () => {
    const mgr = new SubtreeLockManager(root, 50); // 50ms timeout
    const release = await mgr.acquire('a');

    await expect(mgr.acquire('a')).rejects.toThrow(/Lock timeout/);
    release();
  });

  it('release is idempotent', async () => {
    const mgr = new SubtreeLockManager(root);
    const release = await mgr.acquire('a');
    release();
    release(); // should not throw
    expect(mgr.activeCount).toBe(0);
  });
});
