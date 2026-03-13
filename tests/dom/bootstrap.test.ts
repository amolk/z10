import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { bootstrapDocument } from '../../src/dom/bootstrap.js';
import { LamportClock } from '../../src/dom/clock.js';
import { getTimestamp, TS_NODE, TS_CHILDREN, TS_TEXT, TS_TREE } from '../../src/dom/timestamps.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

describe('bootstrapDocument', () => {
  it('assigns IDs and timestamps to all elements', () => {
    document.body.innerHTML = '<div><span>hello</span><p>world</p></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const clock = new LamportClock();

    const count = bootstrapDocument(root, clock);

    expect(count).toBe(3); // div, span, p
    expect(root.getAttribute('data-z10-id')).toBe('n1');
    expect(clock.value).toBe(1); // ticked once
  });

  it('sets tree timestamps correctly on nested structure', () => {
    document.body.innerHTML = '<div><section><p>text</p></section></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const clock = new LamportClock();

    bootstrapDocument(root, clock);

    // All tree timestamps should be 1 (same commit)
    expect(getTimestamp(root, TS_TREE)).toBe(1);
    const section = root.querySelector('section') as unknown as Element;
    expect(getTimestamp(section, TS_TREE)).toBe(1);
    const p = root.querySelector('p') as unknown as Element;
    expect(getTimestamp(p, TS_TREE)).toBe(1);
  });

  it('preserves existing data-z10-id values', () => {
    document.body.innerHTML = '<div data-z10-id="existing"><span>text</span></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const clock = new LamportClock();

    bootstrapDocument(root, clock);

    expect(root.getAttribute('data-z10-id')).toBe('existing');
  });

  it('uses custom ID prefix and start', () => {
    document.body.innerHTML = '<div><span></span></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const clock = new LamportClock();

    bootstrapDocument(root, clock, { idPrefix: 'node-', idStartAt: 100 });

    expect(root.getAttribute('data-z10-id')).toBe('node-100');
    expect((root.querySelector('span') as unknown as Element).getAttribute('data-z10-id')).toBe('node-101');
  });

  it('handles empty root element', () => {
    document.body.innerHTML = '<div></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const clock = new LamportClock();

    const count = bootstrapDocument(root, clock);

    expect(count).toBe(1);
    expect(root.getAttribute('data-z10-id')).toBe('n1');
    expect(getTimestamp(root, TS_NODE)).toBe(1);
  });
});
