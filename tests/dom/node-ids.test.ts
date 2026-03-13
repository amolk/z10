import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { assignNodeIds, createIdGenerator } from '../../src/dom/node-ids.js';
import { getTimestamp, TS_NODE, TS_TREE } from '../../src/dom/timestamps.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

describe('createIdGenerator', () => {
  it('generates sequential IDs with default prefix', () => {
    const gen = createIdGenerator();
    expect(gen()).toBe('n1');
    expect(gen()).toBe('n2');
    expect(gen()).toBe('n3');
  });

  it('uses custom prefix', () => {
    const gen = createIdGenerator('node-');
    expect(gen()).toBe('node-1');
  });

  it('starts at custom value', () => {
    const gen = createIdGenerator('n', 100);
    expect(gen()).toBe('n100');
    expect(gen()).toBe('n101');
  });
});

describe('assignNodeIds', () => {
  it('assigns IDs to all elements without one', () => {
    document.body.innerHTML = '<div><span>text</span><p>para</p></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const gen = createIdGenerator();

    const count = assignNodeIds(root, gen, 1);

    expect(count).toBe(3); // div, span, p
    expect(root.getAttribute('data-z10-id')).toBe('n1');
    expect((root.querySelector('span') as unknown as Element).getAttribute('data-z10-id')).toBe('n2');
    expect((root.querySelector('p') as unknown as Element).getAttribute('data-z10-id')).toBe('n3');
  });

  it('skips elements that already have data-z10-id', () => {
    document.body.innerHTML = '<div data-z10-id="existing"><span>text</span></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const gen = createIdGenerator();

    const count = assignNodeIds(root, gen, 1);

    expect(count).toBe(1); // only span
    expect(root.getAttribute('data-z10-id')).toBe('existing');
    expect((root.querySelector('span') as unknown as Element).getAttribute('data-z10-id')).toBe('n1');
  });

  it('sets initial timestamps on newly assigned elements', () => {
    document.body.innerHTML = '<div><span>text</span></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const gen = createIdGenerator();

    assignNodeIds(root, gen, 42);

    expect(getTimestamp(root, TS_NODE)).toBe(42);
    expect(getTimestamp(root, TS_TREE)).toBe(42);
    const span = root.querySelector('span') as unknown as Element;
    expect(getTimestamp(span, TS_NODE)).toBe(42);
  });

  it('returns 0 when all elements already have IDs', () => {
    document.body.innerHTML = '<div data-z10-id="n1"><span data-z10-id="n2"></span></div>';
    const root = document.body.firstElementChild as unknown as Element;
    const gen = createIdGenerator();

    const count = assignNodeIds(root, gen, 1);
    expect(count).toBe(0);
  });
});
