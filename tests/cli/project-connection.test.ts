/**
 * B6. Tests for CLI startup + resync — project connection manager.
 *
 * Tests the ProjectConnection class lifecycle and the singleton
 * connection manager. Uses manual construction (not connect())
 * to avoid network calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectConnection, disconnectAll } from '../../src/cli/project-connection.js';

describe('B6: Project Connection Manager', () => {
  afterEach(() => {
    disconnectAll();
  });

  it('creates a connection with a LocalProxy', () => {
    const conn = new ProjectConnection({ projectId: 'conn-1' });
    expect(conn.proxy).toBeDefined();
    expect(conn.isConnected).toBe(false);
    conn.disconnect();
  });

  it('loadDocument works on the proxy before connect', () => {
    const conn = new ProjectConnection({ projectId: 'conn-2' });

    // Simulate what connect() does: load document into proxy
    conn.proxy.loadDocument(
      '<div data-z10-id="root" data-z10-ts-node="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-tree="1">Hello</span></div>',
      5,
    );

    expect(conn.proxy.currentTxId).toBe(5);
    expect(conn.proxy.getFullHtml()).toContain('Hello');

    conn.disconnect();
  });

  it('resync overwrites local state', () => {
    const conn = new ProjectConnection({ projectId: 'conn-3' });

    // Initial state
    conn.proxy.loadDocument(
      '<div data-z10-id="root" data-z10-ts-node="1" data-z10-ts-tree="1">Old</div>',
      3,
    );
    expect(conn.proxy.getFullHtml()).toContain('Old');

    // Simulate resync with new state
    conn.proxy.loadDocument(
      '<div data-z10-id="root" data-z10-ts-node="10" data-z10-ts-tree="10">New</div>',
      10,
    );
    expect(conn.proxy.currentTxId).toBe(10);
    expect(conn.proxy.getFullHtml()).toContain('New');
    expect(conn.proxy.getFullHtml()).not.toContain('Old');

    conn.disconnect();
  });

  it('disconnect cleans up resources', () => {
    const conn = new ProjectConnection({ projectId: 'conn-4' });
    conn.proxy.loadDocument('<div data-z10-id="root" data-z10-ts-node="1" data-z10-ts-tree="1">X</div>', 1);

    conn.disconnect();
    expect(conn.isConnected).toBe(false);
  });

  it('proxy applies patches after loadDocument', () => {
    const conn = new ProjectConnection({ projectId: 'conn-5' });

    conn.proxy.loadDocument(
      '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-tree="1">Before</span></div>',
      1,
    );

    // Apply a patch (simulating SSE event)
    conn.proxy.applyPatch({
      txId: 2,
      timestamp: 2,
      ops: [{ op: 'text', id: 'title', value: 'After' }],
    });

    expect(conn.proxy.currentTxId).toBe(2);
    expect(conn.proxy.getFullHtml()).toContain('After');

    conn.disconnect();
  });
});
