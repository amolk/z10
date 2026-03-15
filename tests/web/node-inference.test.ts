/**
 * Tests for node-inference.ts — inferring element types from HTML semantics.
 */

import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { inferNodeType, isContainer, isTextEditable } from '../../web/src/lib/node-inference';

function createElement(tag: string, attrs: Record<string, string> = {}, innerHTML = ''): HTMLElement {
  const win = new Window();
  const doc = win.document;
  const el = doc.createElement(tag) as unknown as HTMLElement;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') {
      el.className = v;
    } else {
      el.setAttribute(k, v);
    }
  }
  if (innerHTML) {
    el.innerHTML = innerHTML;
  }
  return el;
}

describe('inferNodeType', () => {
  it('DIV with style="display: flex" → "frame"', () => {
    expect(inferNodeType(createElement('div', { style: 'display: flex' }))).toBe('frame');
  });

  it('DIV with className "flex" → "frame"', () => {
    expect(inferNodeType(createElement('div', { className: 'flex' }))).toBe('frame');
  });

  it('DIV with className "grid" → "frame"', () => {
    expect(inferNodeType(createElement('div', { className: 'grid' }))).toBe('frame');
  });

  it('DIV with child elements → "frame"', () => {
    expect(inferNodeType(createElement('div', {}, '<span>child</span>'))).toBe('frame');
  });

  it('SECTION tag with children → "frame"', () => {
    expect(inferNodeType(createElement('section', {}, '<div>x</div>'))).toBe('frame');
  });

  it('NAV tag with children → "frame"', () => {
    expect(inferNodeType(createElement('nav', {}, '<a>link</a>'))).toBe('frame');
  });

  it('HEADER tag with children → "frame"', () => {
    expect(inferNodeType(createElement('header', {}, '<div>x</div>'))).toBe('frame');
  });

  it('UL tag with children → "frame"', () => {
    expect(inferNodeType(createElement('ul', {}, '<li>item</li>'))).toBe('frame');
  });

  it('custom element → "frame"', () => {
    expect(inferNodeType(createElement('my-widget'))).toBe('frame');
  });

  it('P tag → "text"', () => {
    expect(inferNodeType(createElement('p', {}, 'hello'))).toBe('text');
  });

  it('SPAN tag → "text"', () => {
    expect(inferNodeType(createElement('span', {}, 'hello'))).toBe('text');
  });

  it('H1 tag → "text"', () => {
    expect(inferNodeType(createElement('h1', {}, 'Title'))).toBe('text');
  });

  it('A tag → "text"', () => {
    expect(inferNodeType(createElement('a', {}, 'link'))).toBe('text');
  });

  it('LABEL tag → "text"', () => {
    expect(inferNodeType(createElement('label', {}, 'Name'))).toBe('text');
  });

  it('BLOCKQUOTE tag → "text"', () => {
    expect(inferNodeType(createElement('blockquote', {}, 'quote'))).toBe('text');
  });

  it('empty DIV (no children, no text) → "element"', () => {
    expect(inferNodeType(createElement('div'))).toBe('element');
  });

  it('IMG tag → "element"', () => {
    expect(inferNodeType(createElement('img'))).toBe('element');
  });

  it('INPUT tag → "element"', () => {
    expect(inferNodeType(createElement('input'))).toBe('element');
  });

  it('SVG tag → "element"', () => {
    expect(inferNodeType(createElement('svg'))).toBe('element');
  });

  it('BUTTON tag → "element"', () => {
    expect(inferNodeType(createElement('button'))).toBe('element');
  });
});

describe('isContainer', () => {
  it('DIV with flex display → true', () => {
    expect(isContainer(createElement('div', { style: 'display: flex' }))).toBe(true);
  });

  it('DIV with grid display → true', () => {
    expect(isContainer(createElement('div', { style: 'display: grid' }))).toBe(true);
  });

  it('SECTION tag with children → true', () => {
    expect(isContainer(createElement('section', {}, '<div>x</div>'))).toBe(true);
  });

  it('empty DIV → false', () => {
    expect(isContainer(createElement('div'))).toBe(false);
  });

  it('P tag → false', () => {
    expect(isContainer(createElement('p', {}, 'text'))).toBe(false);
  });

  it('IMG tag → false', () => {
    expect(isContainer(createElement('img'))).toBe(false);
  });
});

describe('isTextEditable', () => {
  it('P tag with text → true', () => {
    expect(isTextEditable(createElement('p', {}, 'Hello'))).toBe(true);
  });

  it('SPAN with text → true', () => {
    expect(isTextEditable(createElement('span', {}, 'Hello'))).toBe(true);
  });

  it('H1 with text → true', () => {
    expect(isTextEditable(createElement('h1', {}, 'Title'))).toBe(true);
  });

  it('DIV (leaf) with textContent, no child z10-id elements → true', () => {
    expect(isTextEditable(createElement('div', {}, 'just text'))).toBe(true);
  });

  it('DIV with child z10-id elements → false', () => {
    expect(isTextEditable(createElement('div', {}, '<div data-z10-id="child">x</div>'))).toBe(false);
  });

  it('empty P (no textContent) → true (text-semantic tag)', () => {
    expect(isTextEditable(createElement('p'))).toBe(true);
  });

  it('IMG → false', () => {
    expect(isTextEditable(createElement('img'))).toBe(false);
  });
});

describe('dynamic inference — DOM mutations change results', () => {
  it('DIV starts as "element" → add display: flex → becomes "frame"', () => {
    const el = createElement('div');
    expect(inferNodeType(el)).toBe('element');
    el.style.display = 'flex';
    expect(inferNodeType(el)).toBe('frame');
  });

  it('DIV starts as "element" → add className "flex" → becomes "frame"', () => {
    const el = createElement('div');
    expect(inferNodeType(el)).toBe('element');
    el.className = 'flex';
    expect(inferNodeType(el)).toBe('frame');
  });

  it('DIV with display: flex → change to display: block → becomes "element"', () => {
    const el = createElement('div', { style: 'display: flex' });
    expect(inferNodeType(el)).toBe('frame');
    el.style.display = 'block';
    expect(inferNodeType(el)).toBe('element');
  });

  it('DIV starts as "element" → append a child → becomes "frame"', () => {
    const win = new Window();
    const doc = win.document;
    const el = doc.createElement('div') as unknown as HTMLElement;
    expect(inferNodeType(el)).toBe('element');
    const child = doc.createElement('span');
    el.appendChild(child);
    expect(inferNodeType(el)).toBe('frame');
  });

  it('DIV with children → remove all children → becomes "element"', () => {
    const win = new Window();
    const doc = win.document;
    const el = doc.createElement('div') as unknown as HTMLElement;
    el.appendChild(doc.createElement('span'));
    expect(inferNodeType(el)).toBe('frame');
    el.innerHTML = '';
    expect(inferNodeType(el)).toBe('element');
  });

  it('empty DIV → set textContent → becomes text-editable', () => {
    const el = createElement('div');
    expect(isTextEditable(el)).toBe(false);
    el.textContent = 'Hello world';
    expect(isTextEditable(el)).toBe(true);
  });

  it('DIV with text → add child with data-z10-id → no longer text-editable', () => {
    const win = new Window();
    const doc = win.document;
    const el = doc.createElement('div') as unknown as HTMLElement;
    el.textContent = 'Some text';
    expect(isTextEditable(el)).toBe(true);
    const child = doc.createElement('div');
    child.setAttribute('data-z10-id', 'child1');
    el.appendChild(child);
    expect(isTextEditable(el)).toBe(false);
  });

  it('SPAN → add child element → becomes "frame"', () => {
    const win = new Window();
    const doc = win.document;
    const el = doc.createElement('span') as unknown as HTMLElement;
    expect(inferNodeType(el)).toBe('text');
    el.appendChild(doc.createElement('div'));
    expect(inferNodeType(el)).toBe('frame');
  });

  it('DIV with className "grid" → remove class → becomes "element"', () => {
    const el = createElement('div', { className: 'grid' });
    expect(inferNodeType(el)).toBe('frame');
    el.className = '';
    expect(inferNodeType(el)).toBe('element');
  });
});
