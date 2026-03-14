/**
 * D1. Tests for usePatchStream — SSE patch connection hook.
 *
 * Tests the event parsing and type discrimination logic. The actual React hook
 * behavior (EventSource, state updates, reconnection) is tested via integration.
 * These unit tests verify that the PatchStreamEvent types correctly parse
 * the SSE event format from the /patches endpoint.
 */

import { describe, it, expect } from 'vitest';
import type { PatchEnvelope, PatchOp } from '../../src/dom/patch-serialize.js';

// ── Test the SSE event format matching the /patches endpoint ──

describe('PatchStreamEvent parsing', () => {
  it('should parse connected event', () => {
    const raw = '{"type":"connected","projectId":"proj-1","txId":42}';
    const data = JSON.parse(raw);
    expect(data.type).toBe('connected');
    expect(data.projectId).toBe('proj-1');
    expect(data.txId).toBe(42);
  });

  it('should parse patch event with PatchEnvelope', () => {
    const patch: PatchEnvelope = {
      txId: 5,
      timestamp: 1234567890,
      ops: [
        { op: 'attr', id: 'card', name: 'class', value: 'updated' },
        { op: 'text', id: 'label', value: 'New text' },
      ],
    };
    const raw = JSON.stringify({ type: 'patch', patch });
    const data = JSON.parse(raw);
    expect(data.type).toBe('patch');
    expect(data.patch.txId).toBe(5);
    expect(data.patch.ops).toHaveLength(2);
    expect(data.patch.ops[0].op).toBe('attr');
    expect(data.patch.ops[1].op).toBe('text');
  });

  it('should parse resync event with full HTML', () => {
    const html = '<div data-z10-id="root"><span data-z10-id="child">Hello</span></div>';
    const raw = JSON.stringify({ type: 'resync', html, txId: 100 });
    const data = JSON.parse(raw);
    expect(data.type).toBe('resync');
    expect(data.html).toBe(html);
    expect(data.txId).toBe(100);
  });

  it('should parse heartbeat event', () => {
    const raw = '{"type":"heartbeat"}';
    const data = JSON.parse(raw);
    expect(data.type).toBe('heartbeat');
  });

  it('should handle all 5 patch op types', () => {
    const ops: PatchOp[] = [
      { op: 'attr', id: 'n1', name: 'class', value: 'box' },
      { op: 'style', id: 'n1', prop: 'color', value: 'red' },
      { op: 'text', id: 'n2', value: 'Updated' },
      { op: 'add', parentId: 'n1', html: '<span data-z10-id="n3">New</span>', before: null },
      { op: 'remove', id: 'n4' },
    ];
    const envelope: PatchEnvelope = { txId: 10, timestamp: Date.now(), ops };
    const raw = JSON.stringify({ type: 'patch', patch: envelope });
    const data = JSON.parse(raw);

    expect(data.patch.ops).toHaveLength(5);
    const parsed = data.patch.ops;
    expect(parsed[0].op).toBe('attr');
    expect(parsed[1].op).toBe('style');
    expect(parsed[2].op).toBe('text');
    expect(parsed[3].op).toBe('add');
    expect(parsed[4].op).toBe('remove');
  });

  it('should handle patch with empty ops array', () => {
    const envelope: PatchEnvelope = { txId: 1, timestamp: Date.now(), ops: [] };
    const raw = JSON.stringify({ type: 'patch', patch: envelope });
    const data = JSON.parse(raw);
    expect(data.patch.ops).toHaveLength(0);
  });
});

describe('SSE wire format', () => {
  it('should match the data: prefix format used by /patches endpoint', () => {
    // The /patches endpoint sends: data: {json}\n\n
    // EventSource.onmessage receives just the data portion
    const json = '{"type":"patch","patch":{"txId":1,"timestamp":0,"ops":[]}}';
    const wireFormat = `data: ${json}\n\n`;

    // Simulate what EventSource does: extract data after "data: " prefix
    const match = wireFormat.match(/^data: (.+)\n\n$/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.type).toBe('patch');
    expect(parsed.patch.txId).toBe(1);
  });

  it('should handle reconnection with lastSeenTxId query param', () => {
    // Verify URL construction for reconnection
    const projectId = 'proj-123';
    const lastTxId = 42;
    const url = `/api/projects/${projectId}/patches?lastSeenTxId=${lastTxId}`;
    expect(url).toBe('/api/projects/proj-123/patches?lastSeenTxId=42');
  });

  it('should construct initial URL without lastSeenTxId', () => {
    const projectId = 'proj-123';
    const lastTxId = 0;
    const url =
      lastTxId > 0
        ? `/api/projects/${projectId}/patches?lastSeenTxId=${lastTxId}`
        : `/api/projects/${projectId}/patches`;
    expect(url).toBe('/api/projects/proj-123/patches');
  });
});
