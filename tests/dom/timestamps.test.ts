import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import {
  TS_NODE, TS_CHILDREN, TS_TEXT, TS_TREE,
  getTimestamp, setTimestamp,
  tsAttrName, tsStylePropName,
  setInitialTimestamps,
  bubbleTimestamp, bumpTimestamps,
  type WriteSetEntry,
} from '../../src/dom/timestamps.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

describe('timestamp attribute helpers', () => {
  it('tsAttrName produces correct name', () => {
    expect(tsAttrName('class')).toBe('data-z10-ts-a-class');
    expect(tsAttrName('data-price')).toBe('data-z10-ts-a-data-price');
  });

  it('tsStylePropName produces correct name', () => {
    expect(tsStylePropName('font-size')).toBe('data-z10-ts-a-style-font-size');
    expect(tsStylePropName('background-color')).toBe('data-z10-ts-a-style-background-color');
  });
});

describe('getTimestamp / setTimestamp', () => {
  it('returns 0 for unset attribute', () => {
    const el = document.createElement('div');
    expect(getTimestamp(el as unknown as Element, TS_NODE)).toBe(0);
  });

  it('reads written timestamp', () => {
    const el = document.createElement('div');
    setTimestamp(el as unknown as Element, TS_NODE, 42);
    expect(getTimestamp(el as unknown as Element, TS_NODE)).toBe(42);
  });
});

describe('setInitialTimestamps', () => {
  it('sets all base timestamps', () => {
    const el = document.createElement('div') as unknown as Element;
    setInitialTimestamps(el, 10);
    expect(getTimestamp(el, TS_NODE)).toBe(10);
    expect(getTimestamp(el, TS_CHILDREN)).toBe(10);
    expect(getTimestamp(el, TS_TEXT)).toBe(10);
    expect(getTimestamp(el, TS_TREE)).toBe(10);
  });

  it('sets attribute timestamps for existing non-system attributes', () => {
    const el = document.createElement('div') as unknown as Element;
    el.setAttribute('class', 'card');
    el.setAttribute('data-price', '29.99');
    setInitialTimestamps(el, 5);
    expect(getTimestamp(el, tsAttrName('class'))).toBe(5);
    expect(getTimestamp(el, tsAttrName('data-price'))).toBe(5);
  });

  it('sets per-property timestamps for inline styles', () => {
    const el = document.createElement('div') as unknown as Element;
    el.setAttribute('style', 'font-size: 16px; color: red');
    setInitialTimestamps(el, 7);
    expect(getTimestamp(el, tsStylePropName('font-size'))).toBe(7);
    expect(getTimestamp(el, tsStylePropName('color'))).toBe(7);
    expect(getTimestamp(el, tsAttrName('style'))).toBe(7);
  });

  it('skips data-z10-* system attributes', () => {
    const el = document.createElement('div') as unknown as Element;
    el.setAttribute('data-z10-id', 'n1');
    setInitialTimestamps(el, 3);
    // Should not create timestamp for data-z10-id
    expect(getTimestamp(el, tsAttrName('data-z10-id'))).toBe(0);
  });
});

describe('bubbleTimestamp', () => {
  it('bubbles ts-tree up ancestor chain', () => {
    document.body.innerHTML = '<div id="grandparent"><div id="parent"><div id="child"></div></div></div>';
    const gp = document.getElementById('grandparent') as unknown as Element;
    const p = document.getElementById('parent') as unknown as Element;
    const child = document.getElementById('child') as unknown as Element;

    setTimestamp(gp, TS_TREE, 1);
    setTimestamp(p, TS_TREE, 1);
    setTimestamp(child, TS_TREE, 1);

    bubbleTimestamp(child, 5);

    expect(getTimestamp(child, TS_TREE)).toBe(5);
    expect(getTimestamp(p, TS_TREE)).toBe(5);
    expect(getTimestamp(gp, TS_TREE)).toBe(5);
  });

  it('stops early when ancestor has higher timestamp', () => {
    document.body.innerHTML = '<div id="grandparent"><div id="parent"><div id="child"></div></div></div>';
    const gp = document.getElementById('grandparent') as unknown as Element;
    const p = document.getElementById('parent') as unknown as Element;
    const child = document.getElementById('child') as unknown as Element;

    setTimestamp(gp, TS_TREE, 100);
    setTimestamp(p, TS_TREE, 50);
    setTimestamp(child, TS_TREE, 1);

    bubbleTimestamp(child, 10);

    expect(getTimestamp(child, TS_TREE)).toBe(10);
    expect(getTimestamp(p, TS_TREE)).toBe(50); // unchanged — was already higher
    expect(getTimestamp(gp, TS_TREE)).toBe(100); // unchanged — was already higher
  });
});

describe('bumpTimestamps', () => {
  it('bumps timestamps for structural facet', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-node="1" data-z10-ts-tree="1"></div>';
    const root = document.body as unknown as Element;
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'structural' }];

    bumpTimestamps(writeSet, 5, root);

    const el = document.querySelector('[data-z10-id="n1"]') as unknown as Element;
    expect(getTimestamp(el, TS_NODE)).toBe(5);
    expect(getTimestamp(el, TS_TREE)).toBe(5);
  });

  it('bumps timestamps for text facet', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-text="1" data-z10-ts-tree="1"></div>';
    const root = document.body as unknown as Element;
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'text' }];

    bumpTimestamps(writeSet, 10, root);

    const el = document.querySelector('[data-z10-id="n1"]') as unknown as Element;
    expect(getTimestamp(el, TS_TEXT)).toBe(10);
  });

  it('bumps timestamps for attribute facet', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-tree="1"></div>';
    const root = document.body as unknown as Element;
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'attribute', attribute: 'class' }];

    bumpTimestamps(writeSet, 7, root);

    const el = document.querySelector('[data-z10-id="n1"]') as unknown as Element;
    expect(getTimestamp(el, tsAttrName('class'))).toBe(7);
  });

  it('bumps timestamps for style-property facet', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-tree="1"></div>';
    const root = document.body as unknown as Element;
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'style-property', property: 'font-size' }];

    bumpTimestamps(writeSet, 12, root);

    const el = document.querySelector('[data-z10-id="n1"]') as unknown as Element;
    expect(getTimestamp(el, tsStylePropName('font-size'))).toBe(12);
    expect(getTimestamp(el, tsAttrName('style'))).toBe(12);
  });

  it('bubbles tree timestamp after bumping', () => {
    document.body.innerHTML = `
      <div data-z10-id="parent" data-z10-ts-tree="1">
        <div data-z10-id="child" data-z10-ts-text="1" data-z10-ts-tree="1"></div>
      </div>
    `;
    const root = document.body as unknown as Element;
    const writeSet: WriteSetEntry[] = [{ nid: 'child', facet: 'text' }];

    bumpTimestamps(writeSet, 20, root);

    const parent = document.querySelector('[data-z10-id="parent"]') as unknown as Element;
    expect(getTimestamp(parent, TS_TREE)).toBe(20);
  });
});
