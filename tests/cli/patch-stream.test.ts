/**
 * B5. Tests for CLI SSE patch consumer.
 *
 * Tests the SSE parsing and event application logic. The PatchStream class
 * (which manages network connections) is tested at a higher level; these
 * tests cover the pure functions that parse SSE data and apply events.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseSseEvent, parseSseStream, applyStreamEvent, type PatchStreamEvent } from '../../src/cli/patch-stream.js';
import { LocalProxy } from '../../src/dom/proxy.js';
import type { PatchEnvelope } from '../../src/dom/patch-serialize.js';

describe('B5: CLI SSE Patch Consumer', () => {
  describe('parseSseEvent', () => {
    it('parses a connected event', () => {
      const event = parseSseEvent('{"type":"connected","projectId":"p1","txId":5}');
      expect(event).toEqual({ type: 'connected', projectId: 'p1', txId: 5 });
    });

    it('parses a patch event', () => {
      const patch: PatchEnvelope = { txId: 3, timestamp: 3, ops: [{ type: 'text', nid: 'a', value: 'hi' }] };
      const event = parseSseEvent(JSON.stringify({ type: 'patch', patch }));
      expect(event).toEqual({ type: 'patch', patch });
    });

    it('parses a resync event', () => {
      const event = parseSseEvent('{"type":"resync","html":"<div>hi</div>","txId":10}');
      expect(event).toEqual({ type: 'resync', html: '<div>hi</div>', txId: 10 });
    });

    it('parses a heartbeat event', () => {
      const event = parseSseEvent('{"type":"heartbeat"}');
      expect(event).toEqual({ type: 'heartbeat' });
    });

    it('returns null for invalid JSON', () => {
      expect(parseSseEvent('not json')).toBeNull();
      expect(parseSseEvent('')).toBeNull();
    });
  });

  describe('parseSseStream', () => {
    function makeReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
      const encoder = new TextEncoder();
      let index = 0;
      return {
        read: async () => {
          if (index >= chunks.length) return { done: true, value: undefined } as ReadableStreamReadResult<Uint8Array>;
          return { done: false, value: encoder.encode(chunks[index++]) };
        },
        cancel: async () => {},
        closed: Promise.resolve(undefined),
        releaseLock: () => {},
      } as ReadableStreamDefaultReader<Uint8Array>;
    }

    it('parses a complete SSE stream', async () => {
      const reader = makeReader([
        'data: {"type":"connected","projectId":"p1","txId":0}\n\n',
        'data: {"type":"heartbeat"}\n\n',
      ]);

      const events: PatchStreamEvent[] = [];
      for await (const event of parseSseStream(reader)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('connected');
      expect(events[1].type).toBe('heartbeat');
    });

    it('handles chunked data across multiple reads', async () => {
      // The event is split across two chunks
      const reader = makeReader([
        'data: {"type":"conn',
        'ected","projectId":"p1","txId":5}\n\n',
      ]);

      const events: PatchStreamEvent[] = [];
      for await (const event of parseSseStream(reader)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'connected', projectId: 'p1', txId: 5 });
    });

    it('handles multiple events in a single chunk', async () => {
      const reader = makeReader([
        'data: {"type":"connected","projectId":"p1","txId":0}\n\ndata: {"type":"heartbeat"}\n\n',
      ]);

      const events: PatchStreamEvent[] = [];
      for await (const event of parseSseStream(reader)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
    });
  });

  describe('applyStreamEvent', () => {
    let proxy: LocalProxy;

    beforeEach(() => {
      proxy = new LocalProxy();
      proxy.loadDocument(
        '<div data-z10-id="card" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1"><span data-z10-id="title" data-z10-ts-node="1" data-z10-ts-children="1" data-z10-ts-text="1" data-z10-ts-tree="1">Hello</span></div>',
        1,
      );
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('applies a patch event to the proxy', () => {
      const patch: PatchEnvelope = {
        txId: 2,
        timestamp: 2,
        ops: [{ op: 'text', id: 'title', value: 'Updated' }],
      };

      const meaningful = applyStreamEvent(proxy, { type: 'patch', patch });

      expect(meaningful).toBe(true);
      expect(proxy.currentTxId).toBe(2);
      expect(proxy.getFullHtml()).toContain('Updated');
    });

    it('applies a resync event to the proxy', () => {
      const meaningful = applyStreamEvent(proxy, {
        type: 'resync',
        html: '<div data-z10-id="new" data-z10-ts-node="5" data-z10-ts-tree="5">Fresh</div>',
        txId: 10,
      });

      expect(meaningful).toBe(true);
      expect(proxy.currentTxId).toBe(10);
      expect(proxy.getFullHtml()).toContain('Fresh');
    });

    it('ignores connected events', () => {
      const meaningful = applyStreamEvent(proxy, {
        type: 'connected',
        projectId: 'p1',
        txId: 1,
      });

      expect(meaningful).toBe(false);
    });

    it('ignores heartbeat events', () => {
      const meaningful = applyStreamEvent(proxy, { type: 'heartbeat' });
      expect(meaningful).toBe(false);
    });
  });
});
