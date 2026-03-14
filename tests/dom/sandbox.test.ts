/**
 * Tests for sandbox hardening (F1).
 *
 * Validates that agent code runs in an isolated context with:
 * - No access to live globals (globalThis, window, process)
 * - Frozen built-in prototypes (no prototype pollution)
 * - No network APIs (fetch, XMLHttpRequest, WebSocket)
 * - No timers (setTimeout, setInterval)
 * - No module loading (require, import)
 * - CPU time limits via timeout
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Window } from 'happy-dom';
import { createSandboxContext, executeSandboxCode } from '../../src/dom/sandbox.js';

function setup(): { root: Element; cleanup: () => void } {
  const win = new Window();
  win.document.body.innerHTML = '<div data-z10-id="root"><p data-z10-id="p1">Hello</p></div>';
  const root = win.document.querySelector('[data-z10-id="root"]')! as unknown as Element;
  return { root, cleanup: () => win.close() };
}

describe('sandbox hardening (F1)', () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it('allows basic DOM manipulation', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `var p = document.querySelector('[data-z10-id="p1"]'); p.textContent = 'World';`,
      ctx,
    );
    expect(result.success).toBe(true);
    expect(root.querySelector('[data-z10-id="p1"]')!.textContent).toBe('World');
  });

  it('blocks globalThis access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(`if (typeof globalThis !== 'undefined' && globalThis !== undefined) throw new Error('globalThis accessible');`, ctx);
    // globalThis in VM contexts may be the sandbox itself, but should not leak host globals
    // The key check is that process/require/etc. are not on it
    expect(result.success).toBe(true);
  });

  it('blocks process access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (process !== undefined) throw new Error('process is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('blocks require access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (require !== undefined) throw new Error('require is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('blocks fetch access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (fetch !== undefined) throw new Error('fetch is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('blocks setTimeout access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (setTimeout !== undefined) throw new Error('setTimeout is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('blocks setInterval access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (setInterval !== undefined) throw new Error('setInterval is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('blocks WebSocket access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (WebSocket !== undefined) throw new Error('WebSocket is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('blocks XMLHttpRequest access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (XMLHttpRequest !== undefined) throw new Error('XMLHttpRequest is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('prevents prototype pollution on Object.prototype', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    // In strict mode, frozen prototype assignment throws; in sloppy mode, it silently fails.
    // Either way, the property must NOT be added.
    const result = executeSandboxCode(
      `"use strict"; Object.prototype.polluted = true;`,
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/Cannot add property|object is not extensible|Cannot assign/i);
    // Verify host Object.prototype is not polluted
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('prevents prototype pollution on Array.prototype', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `"use strict"; Array.prototype.evil = function() { return 'hacked'; };`,
      ctx,
    );
    expect(result.success).toBe(false);
    // Verify host Array.prototype is not polluted
    expect((Array.prototype as any).evil).toBeUndefined();
  });

  it('silently blocks prototype pollution in sloppy mode', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    // Sloppy mode: silently fails but doesn't add the property
    const result = executeSandboxCode(
      `Object.prototype.sneaky = 42;`,
      ctx,
    );
    // Sloppy mode doesn't throw, but the property is not added
    expect((Object.prototype as any).sneaky).toBeUndefined();
  });

  it('enforces CPU timeout', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(`while(true) {}`, ctx, 50);
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/timed out|timeout/i);
  });

  it('allows JSON usage', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `var obj = JSON.parse('{"a":1}'); document.querySelector('[data-z10-id="p1"]').textContent = JSON.stringify(obj);`,
      ctx,
    );
    expect(result.success).toBe(true);
    expect(root.querySelector('[data-z10-id="p1"]')!.textContent).toBe('{"a":1}');
  });

  it('allows Math usage', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `document.querySelector('[data-z10-id="p1"]').textContent = String(Math.max(1, 5));`,
      ctx,
    );
    expect(result.success).toBe(true);
    expect(root.querySelector('[data-z10-id="p1"]')!.textContent).toBe('5');
  });

  it('allows creating elements', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `var el = document.createElement('span'); el.textContent = 'New'; document.body.appendChild(el);`,
      ctx,
    );
    expect(result.success).toBe(true);
    expect(root.querySelector('span')?.textContent).toBe('New');
  });

  it('blocks window access', () => {
    const { root, cleanup: c } = setup();
    cleanup = c;
    const ctx = createSandboxContext(root);
    const result = executeSandboxCode(
      `if (window !== undefined) throw new Error('window is accessible');`,
      ctx,
    );
    expect(result.success).toBe(true);
  });
});
