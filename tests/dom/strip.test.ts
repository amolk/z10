import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { stripForAgent, stripForExport } from '../../src/dom/strip.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

describe('stripForAgent', () => {
  it('removes timestamps but keeps node IDs', () => {
    document.body.innerHTML = `
      <div data-z10-id="n1" data-z10-ts-node="5" data-z10-ts-tree="10" class="card">
        <span data-z10-id="n2" data-z10-ts-text="3">hello</span>
      </div>
    `;
    const root = document.body.firstElementChild as unknown as Element;
    const stripped = stripForAgent(root);

    // Node IDs preserved
    expect(stripped.getAttribute('data-z10-id')).toBe('n1');
    expect(stripped.querySelector('[data-z10-id="n2"]')).not.toBeNull();

    // Timestamps removed
    expect(stripped.getAttribute('data-z10-ts-node')).toBeNull();
    expect(stripped.getAttribute('data-z10-ts-tree')).toBeNull();
    const span = stripped.querySelector('[data-z10-id="n2"]') as Element;
    expect(span.getAttribute('data-z10-ts-text')).toBeNull();

    // Regular attributes preserved
    expect(stripped.getAttribute('class')).toBe('card');
  });

  it('does not modify the original DOM', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-node="5"></div>';
    const root = document.body.firstElementChild as unknown as Element;
    stripForAgent(root);

    expect(root.getAttribute('data-z10-ts-node')).toBe('5');
  });
});

describe('stripForExport', () => {
  it('removes both node IDs and timestamps', () => {
    document.body.innerHTML = `
      <div data-z10-id="n1" data-z10-ts-node="5" data-z10-ts-tree="10" class="card">
        <span data-z10-id="n2" data-z10-ts-text="3">hello</span>
      </div>
    `;
    const root = document.body.firstElementChild as unknown as Element;
    const stripped = stripForExport(root);

    // Node IDs removed
    expect(stripped.getAttribute('data-z10-id')).toBeNull();
    expect(stripped.querySelector('[data-z10-id]')).toBeNull();

    // Timestamps removed
    expect(stripped.getAttribute('data-z10-ts-node')).toBeNull();

    // Regular attributes preserved
    expect(stripped.getAttribute('class')).toBe('card');
    expect(stripped.querySelector('span')!.textContent).toBe('hello');
  });

  it('does not modify the original DOM', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-node="5"></div>';
    const root = document.body.firstElementChild as unknown as Element;
    stripForExport(root);

    expect(root.getAttribute('data-z10-id')).toBe('n1');
    expect(root.getAttribute('data-z10-ts-node')).toBe('5');
  });
});
