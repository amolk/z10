import { describe, it, expect } from 'vitest';
import { diffDocuments } from '../../src/cli/git.js';
import { createDocument, createNode, addNode, addPage, setTokens, setComponent } from '../../src/core/document.js';
import type { Z10Document } from '../../src/core/types.js';

/** Helper to create a minimal doc with a root node */
function makeDoc(name = 'Test'): Z10Document {
  const doc = createDocument({ name });
  const root = createNode({ id: 'root', tag: 'div', parent: null, intent: 'layout' });
  addNode(doc, root);
  addPage(doc, { name: 'Page 1', rootNodeId: 'root', mode: 'light' });
  return doc;
}

describe('diffDocuments', () => {
  it('returns empty diff for identical documents', () => {
    const doc = makeDoc();
    const diff = diffDocuments(doc, doc);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.tokenChanges).toHaveLength(0);
  });

  it('detects added nodes', () => {
    const docA = makeDoc();
    const docB = makeDoc();
    const child = createNode({ id: 'child1', tag: 'div', parent: 'root' });
    addNode(docB, child);

    const diff = diffDocuments(docA, docB);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.id).toBe('child1');
    expect(diff.removed).toHaveLength(0);
  });

  it('detects removed nodes', () => {
    const docA = makeDoc();
    const child = createNode({ id: 'child1', tag: 'div', parent: 'root' });
    addNode(docA, child);
    const docB = makeDoc();

    const diff = diffDocuments(docA, docB);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]!.id).toBe('child1');
    expect(diff.added).toHaveLength(0);
  });

  it('detects modified node styles', () => {
    const docA = makeDoc();
    const nodeA = createNode({ id: 'btn', tag: 'button', parent: 'root', style: 'color: red' });
    addNode(docA, nodeA);

    const docB = makeDoc();
    const nodeB = createNode({ id: 'btn', tag: 'button', parent: 'root', style: 'color: blue' });
    addNode(docB, nodeB);

    const diff = diffDocuments(docA, docB);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]!.id).toBe('btn');
    const styleChange = diff.modified[0]!.changes!.find(c => c.property === 'color');
    expect(styleChange).toBeDefined();
    expect(styleChange!.oldValue).toBe('red');
    expect(styleChange!.newValue).toBe('blue');
  });

  it('detects text content changes', () => {
    const docA = makeDoc();
    addNode(docA, createNode({ id: 'heading', tag: 'h1', parent: 'root', textContent: 'Hello' }));

    const docB = makeDoc();
    addNode(docB, createNode({ id: 'heading', tag: 'h1', parent: 'root', textContent: 'World' }));

    const diff = diffDocuments(docA, docB);
    expect(diff.modified).toHaveLength(1);
    const textChange = diff.modified[0]!.changes!.find(c => c.property === 'textContent');
    expect(textChange).toBeDefined();
    expect(textChange!.category).toBe('content');
  });

  it('detects tag changes as structural', () => {
    const docA = makeDoc();
    addNode(docA, createNode({ id: 'el', tag: 'div', parent: 'root' }));

    const docB = makeDoc();
    addNode(docB, createNode({ id: 'el', tag: 'section', parent: 'root' }));

    const diff = diffDocuments(docA, docB);
    expect(diff.modified).toHaveLength(1);
    const tagChange = diff.modified[0]!.changes!.find(c => c.property === 'tag');
    expect(tagChange).toBeDefined();
    expect(tagChange!.category).toBe('structure');
  });

  it('detects token additions', () => {
    const docA = makeDoc();
    const docB = makeDoc();
    setTokens(docB, 'primitives', { '--blue-500': '#3b82f6' });

    const diff = diffDocuments(docA, docB);
    expect(diff.tokenChanges).toHaveLength(1);
    expect(diff.tokenChanges[0]!.property).toBe('--blue-500');
    expect(diff.tokenChanges[0]!.oldValue).toBeUndefined();
    expect(diff.tokenChanges[0]!.newValue).toBe('#3b82f6');
  });

  it('detects token removals', () => {
    const docA = makeDoc();
    setTokens(docA, 'primitives', { '--blue-500': '#3b82f6' });
    const docB = makeDoc();

    const diff = diffDocuments(docA, docB);
    expect(diff.tokenChanges).toHaveLength(1);
    expect(diff.tokenChanges[0]!.oldValue).toBe('#3b82f6');
    expect(diff.tokenChanges[0]!.newValue).toBeUndefined();
  });

  it('detects token value changes', () => {
    const docA = makeDoc();
    setTokens(docA, 'semantic', { '--primary': '#3b82f6' });
    const docB = makeDoc();
    setTokens(docB, 'semantic', { '--primary': '#2563eb' });

    const diff = diffDocuments(docA, docB);
    expect(diff.tokenChanges).toHaveLength(1);
    expect(diff.tokenChanges[0]!.oldValue).toBe('#3b82f6');
    expect(diff.tokenChanges[0]!.newValue).toBe('#2563eb');
  });

  it('handles multiple simultaneous changes', () => {
    const docA = makeDoc();
    addNode(docA, createNode({ id: 'a', tag: 'div', parent: 'root' }));
    addNode(docA, createNode({ id: 'b', tag: 'div', parent: 'root', style: 'padding: 8px' }));
    setTokens(docA, 'primitives', { '--red': '#f00' });

    const docB = makeDoc();
    // 'a' removed, 'b' modified, 'c' added
    addNode(docB, createNode({ id: 'b', tag: 'div', parent: 'root', style: 'padding: 16px' }));
    addNode(docB, createNode({ id: 'c', tag: 'span', parent: 'root' }));
    setTokens(docB, 'primitives', { '--red': '#ff0000' });

    const diff = diffDocuments(docA, docB);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.id).toBe('c');
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]!.id).toBe('a');
    // root is also modified because its children array changed
    const modifiedIds = diff.modified.map(m => m.id);
    expect(modifiedIds).toContain('b');
    expect(modifiedIds).toContain('root');
    expect(diff.tokenChanges).toHaveLength(1);
  });

  it('ignores unchanged nodes', () => {
    const docA = makeDoc();
    addNode(docA, createNode({ id: 'stable', tag: 'div', parent: 'root', style: 'color: green' }));

    const docB = makeDoc();
    addNode(docB, createNode({ id: 'stable', tag: 'div', parent: 'root', style: 'color: green' }));

    const diff = diffDocuments(docA, docB);
    expect(diff.modified).toHaveLength(0);
  });

  it('detects reparenting as structural change', () => {
    const docA = makeDoc();
    addNode(docA, createNode({ id: 'container', tag: 'div', parent: 'root' }));
    addNode(docA, createNode({ id: 'child', tag: 'span', parent: 'root' }));

    const docB = makeDoc();
    addNode(docB, createNode({ id: 'container', tag: 'div', parent: 'root' }));
    addNode(docB, createNode({ id: 'child', tag: 'span', parent: 'container' }));

    const diff = diffDocuments(docA, docB);
    // root modified (children change), container modified (gains child), child modified (reparented)
    const childMod = diff.modified.find(m => m.id === 'child');
    expect(childMod).toBeDefined();
    const parentChange = childMod!.changes!.find(c => c.property === 'parent');
    expect(parentChange).toBeDefined();
    expect(parentChange!.category).toBe('structure');
    expect(parentChange!.oldValue).toBe('root');
    expect(parentChange!.newValue).toBe('container');
  });
});
