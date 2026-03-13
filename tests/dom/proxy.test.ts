import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalProxy } from '../../src/dom/proxy.js';
import { createPatchEnvelope, type PatchOp } from '../../src/dom/patch-serialize.js';

let proxy: LocalProxy;

beforeEach(() => {
  proxy = new LocalProxy({ ticketTtlMs: 5000 });
});

afterEach(() => {
  proxy.dispose();
});

// ── B1. CLI DOM Replica ──

describe('B1: CLI DOM Replica', () => {
  it('loads a document into the local DOM', () => {
    proxy.loadDocument('<div data-z10-id="card"><span data-z10-id="title">Hello</span></div>', 5);
    expect(proxy.getFullHtml()).toContain('Hello');
    expect(proxy.currentTxId).toBe(5);
  });

  it('bootstraps a document lacking z10 metadata', () => {
    proxy.loadDocument('<div><span>Hello</span></div>');
    const html = proxy.getFullHtml();
    expect(html).toContain('data-z10-id');
    expect(html).toContain('data-z10-ts-');
  });

  it('applies a patch to the local DOM', () => {
    proxy.loadDocument('<div data-z10-id="card"><span data-z10-id="title">Old</span></div>', 1);
    proxy.applyPatch(createPatchEnvelope(2, 2, [
      { op: 'text', id: 'title', value: 'New' },
    ]));
    expect(proxy.getFullHtml()).toContain('New');
    expect(proxy.currentTxId).toBe(2);
  });

  it('applies multiple patches in order', () => {
    proxy.loadDocument('<div data-z10-id="card"><span data-z10-id="title">v1</span></div>', 1);
    proxy.applyPatches([
      createPatchEnvelope(2, 2, [{ op: 'text', id: 'title', value: 'v2' }]),
      createPatchEnvelope(3, 3, [{ op: 'text', id: 'title', value: 'v3' }]),
    ]);
    expect(proxy.getFullHtml()).toContain('v3');
    expect(proxy.currentTxId).toBe(3);
  });
});

// ── B2. Read Tickets + getSubtree ──

describe('B2: Read Tickets + getSubtree', () => {
  it('returns stripped HTML and a ticket ID', () => {
    proxy.loadDocument(
      '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-text="1" data-z10-ts-tree="1">Hello</span></div>',
      1,
    );
    const result = proxy.getSubtree('[data-z10-id="card"]');

    // HTML should have node IDs but no timestamps
    expect(result.html).toContain('data-z10-id="card"');
    expect(result.html).toContain('data-z10-id="title"');
    expect(result.html).not.toContain('data-z10-ts-');

    // Ticket ID should be valid
    expect(result.ticketId).toMatch(/^t\d+$/);
  });

  it('throws when selector does not match', () => {
    proxy.loadDocument('<div data-z10-id="card"></div>', 1);
    expect(() => proxy.getSubtree('[data-z10-id="missing"]')).toThrow('Subtree not found');
  });

  it('supports depth-limited subtree', () => {
    proxy.loadDocument(
      '<div data-z10-id="root" data-z10-ts-node="1" data-z10-ts-tree="1">' +
        '<div data-z10-id="child" data-z10-ts-node="1" data-z10-ts-tree="1">' +
          '<span data-z10-id="grandchild" data-z10-ts-node="1" data-z10-ts-tree="1">deep</span>' +
        '</div>' +
      '</div>',
      1,
    );
    const result = proxy.getSubtree('[data-z10-id="root"]', 1);

    // Should have root and child but not grandchild content
    expect(result.html).toContain('data-z10-id="root"');
    expect(result.html).toContain('data-z10-id="child"');
    // Grandchild should NOT be present (depth=1 means root + direct children only)
    expect(result.html).not.toContain('data-z10-id="grandchild"');
  });
});

// ── B3. Local Validation + submitCode ──

describe('B3: Local Validation + submitCode', () => {
  it('commits a valid code change', async () => {
    proxy.loadDocument(
      '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">' +
        '<span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Old</span>' +
      '</div>',
      1,
    );

    const { ticketId } = proxy.getSubtree('[data-z10-id="card"]');
    const result = await proxy.submitCode(
      `document.querySelector('span').textContent = 'New'`,
      ticketId,
    );

    expect(result.status).toBe('committed');
    if (result.status === 'committed') {
      expect(result.txId).toBeGreaterThan(0);
      expect(result.html).toContain('New');
      expect(result.newTicketId).toMatch(/^t\d+$/);
    }
  });

  it('rejects code that modifies system attributes', async () => {
    proxy.loadDocument(
      '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">' +
        '<span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Text</span>' +
      '</div>',
      1,
    );

    const { ticketId } = proxy.getSubtree('[data-z10-id="card"]');
    const result = await proxy.submitCode(
      `document.querySelector('span').setAttribute('data-z10-id', 'hacked')`,
      ticketId,
    );

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('illegal-modification');
      // Should provide fresh HTML + new ticket for retry
      expect(result.html).toBeTruthy();
      expect(result.newTicketId).toMatch(/^t\d+$/);
    }
  });

  it('enforces single-use tickets', async () => {
    proxy.loadDocument(
      '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">' +
        '<span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Text</span>' +
      '</div>',
      1,
    );

    const { ticketId } = proxy.getSubtree('[data-z10-id="card"]');
    await proxy.submitCode(`// noop`, ticketId);

    // Second use should throw
    await expect(proxy.submitCode(`// noop`, ticketId)).rejects.toThrow('already used');
  });

  it('throws on invalid ticket', async () => {
    await expect(proxy.submitCode(`// noop`, 'bogus')).rejects.toThrow('Invalid or expired');
  });
});

// ── B4. refreshSubtree ──

describe('B4: refreshSubtree', () => {
  it('reports no change when subtree is unchanged', () => {
    proxy.loadDocument(
      '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-tree="1">Text</span></div>',
      1,
    );
    const { ticketId } = proxy.getSubtree('[data-z10-id="card"]');
    const result = proxy.refreshSubtree(ticketId);
    expect(result.changed).toBe(false);
  });

  it('reports change after a commit modifies the subtree', async () => {
    proxy.loadDocument(
      '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">' +
        '<span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Old</span>' +
      '</div>',
      1,
    );
    const { ticketId: readTicket } = proxy.getSubtree('[data-z10-id="card"]');

    // Make a change via another ticket
    const { ticketId: writeTicket } = proxy.getSubtree('[data-z10-id="card"]');
    await proxy.submitCode(`document.querySelector('span').textContent = 'New'`, writeTicket);

    // Now check if the read ticket's subtree has changed
    const result = proxy.refreshSubtree(readTicket);
    expect(result.changed).toBe(true);
    expect(result.html).toContain('New');
    expect(result.newTicketId).toMatch(/^t\d+$/);
  });

  it('throws on invalid ticket', () => {
    expect(() => proxy.refreshSubtree('bogus')).toThrow('Invalid or expired');
  });
});
