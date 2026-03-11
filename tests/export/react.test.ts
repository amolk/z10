/**
 * Tests for React + Tailwind export.
 *
 * Validates conversion of Z10 document structures to React components
 * with Tailwind CSS utility classes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { exportReact } from '../../src/export/react.js';
import {
  createDocument,
  addNode,
  createNode,
  addPage,
  setTokens,
  setComponent,
} from '../../src/core/document.js';
import type { Z10Document, ComponentSchema } from '../../src/core/types.js';

function buildTestDoc(): Z10Document {
  const doc = createDocument({ name: 'TestApp' });

  // Tokens
  setTokens(doc, 'primitives', {
    '--blue-500': '#3b82f6',
    '--gray-900': '#111827',
  });
  setTokens(doc, 'semantic', {
    '--primary': 'var(--blue-500)',
    '--text': 'var(--gray-900)',
  });

  // Component
  setComponent(doc, {
    name: 'Button',
    props: [
      { name: 'label', type: 'string', required: true },
      { name: 'variant', type: 'enum', options: ['primary', 'secondary'], default: 'primary' },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    variants: [
      { name: 'primary', props: { variant: 'primary' } },
      { name: 'secondary', props: { variant: 'secondary' } },
    ],
    styles: '.btn { padding: 8px 16px; border-radius: 4px; }',
    template: '<button class="btn">{{label}}</button>',
  });

  // Page with nodes
  const root = createNode({ id: 'page_root', tag: 'div', parent: null, intent: 'layout' });
  addNode(doc, root);

  const header = createNode({
    id: 'header',
    tag: 'header',
    parent: 'page_root',
    style: 'display: flex; justify-content: space-between; padding: 16px',
    intent: 'layout',
  });
  addNode(doc, header);

  const title = createNode({
    id: 'title',
    tag: 'h1',
    parent: 'header',
    textContent: 'My App',
    style: 'font-size: 24px; font-weight: 700',
  });
  addNode(doc, title);

  const btn = createNode({
    id: 'save_btn',
    tag: 'div',
    parent: 'header',
    componentName: 'Button',
    componentProps: { label: 'Save', variant: 'primary' },
  });
  addNode(doc, btn);

  const content = createNode({
    id: 'content',
    tag: 'main',
    parent: 'page_root',
    style: 'padding: 32px; display: grid; gap: 16px',
    intent: 'layout',
  });
  addNode(doc, content);

  const card = createNode({
    id: 'card',
    tag: 'div',
    parent: 'content',
    style: 'border-radius: 8px; padding: 24px; background: var(--bg)',
  });
  addNode(doc, card);

  const cardText = createNode({
    id: 'card_text',
    tag: 'p',
    parent: 'card',
    textContent: 'Hello world',
    style: 'font-size: 16px; color: var(--text)',
  });
  addNode(doc, cardText);

  addPage(doc, { name: 'Dashboard', rootNodeId: 'page_root', mode: 'light' });

  return doc;
}

describe('exportReact', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = buildTestDoc();
  });

  it('exports a full document with imports', () => {
    const result = exportReact(doc);
    expect(result.code).toContain("import React from 'react'");
    expect(result.components.length).toBeGreaterThan(0);
  });

  it('exports component definitions with TypeScript props', () => {
    const result = exportReact(doc);
    expect(result.code).toContain('interface ButtonProps');
    expect(result.code).toContain('label: string');
    expect(result.code).toContain("'primary' | 'secondary'");
    expect(result.code).toContain('disabled?: boolean');
    expect(result.code).toContain('export function Button');
  });

  it('exports pages as React components', () => {
    const result = exportReact(doc);
    expect(result.code).toContain('export function Dashboard');
    expect(result.components).toContain('Dashboard');
  });

  it('converts CSS to Tailwind classes', () => {
    const result = exportReact(doc);
    // display: flex → flex
    expect(result.code).toContain('flex');
    // justify-content: space-between → justify-between
    expect(result.code).toContain('justify-between');
    // padding: 16px → p-4
    expect(result.code).toContain('p-4');
    // font-size: 24px → text-2xl
    expect(result.code).toContain('text-2xl');
    // font-weight: 700 → font-bold
    expect(result.code).toContain('font-bold');
    // display: grid → grid
    expect(result.code).toContain('grid');
    // gap: 16px → gap-4
    expect(result.code).toContain('gap-4');
    // border-radius: 8px → rounded-lg
    expect(result.code).toContain('rounded-lg');
    // padding: 24px → p-6
    expect(result.code).toContain('p-6');
    // padding: 32px → p-8
    expect(result.code).toContain('p-8');
  });

  it('falls back to inline styles for non-Tailwind values', () => {
    const result = exportReact(doc);
    // background: var(--bg) doesn't map to Tailwind, should be inline
    expect(result.code).toContain("background: 'var(--bg)'");
    // color: var(--text) doesn't map to Tailwind, should be inline
    expect(result.code).toContain("color: 'var(--text)'");
  });

  it('renders component instances', () => {
    const result = exportReact(doc);
    expect(result.code).toContain('<Button');
    expect(result.code).toContain('label=');
    expect(result.code).toContain('variant=');
  });

  it('renders text content', () => {
    const result = exportReact(doc);
    expect(result.code).toContain('My App');
    expect(result.code).toContain('Hello world');
  });

  it('generates tokens CSS', () => {
    const result = exportReact(doc, { includeTokens: true });
    expect(result.tokensCss).toBeDefined();
    expect(result.tokensCss).toContain('--blue-500: #3b82f6');
    expect(result.tokensCss).toContain('--primary: var(--blue-500)');
    expect(result.tokensCss).toContain(':root');
  });

  it('exports a specific subtree by ID', () => {
    const result = exportReact(doc, { id: 'content' });
    expect(result.code).toContain('export function Content');
    // Should not include header
    expect(result.code).not.toContain('justify-between');
  });

  it('returns error for unknown node ID', () => {
    const result = exportReact(doc, { id: 'nonexistent' });
    expect(result.code).toContain('Error: Node not found');
    expect(result.components).toEqual([]);
  });

  it('omits tokens CSS when includeTokens is false', () => {
    const result = exportReact(doc, { includeTokens: false });
    expect(result.tokensCss).toBeUndefined();
  });

  it('generates JavaScript when typescript is false', () => {
    const result = exportReact(doc, { typescript: false });
    // Should not have TypeScript interfaces
    expect(result.code).not.toContain('interface ButtonProps');
    // Component should still be exported
    expect(result.code).toContain('export function Button');
  });

  it('handles empty document', () => {
    const emptyDoc = createDocument({ name: 'Empty' });
    const result = exportReact(emptyDoc);
    expect(result.code).toContain("import React from 'react'");
    expect(result.components).toEqual([]);
  });

  it('converts template variables to JSX expressions', () => {
    const result = exportReact(doc);
    // {{label}} in template should become {label}
    expect(result.code).toContain('{label}');
    expect(result.code).not.toContain('{{label}}');
  });

  it('converts class to className in templates', () => {
    const result = exportReact(doc);
    expect(result.code).toContain('className="btn"');
    expect(result.code).not.toMatch(/\bclass="btn"/);
  });

  it('includes component in components list', () => {
    const result = exportReact(doc);
    expect(result.components).toContain('Button');
    expect(result.components).toContain('Dashboard');
  });
});

describe('Tailwind CSS mapping', () => {
  it('maps spacing values correctly', () => {
    const doc = createDocument({ name: 'Test' });
    const root = createNode({
      id: 'root',
      tag: 'div',
      parent: null,
      style: 'width: 100%; height: 100vh; margin: 0',
    });
    addNode(doc, root);
    addPage(doc, { name: 'Test', rootNodeId: 'root', mode: 'light' });

    const result = exportReact(doc);
    expect(result.code).toContain('w-full');
    expect(result.code).toContain('h-screen');
    expect(result.code).toContain('m-0');
  });

  it('maps position and overflow', () => {
    const doc = createDocument({ name: 'Test' });
    const root = createNode({
      id: 'root',
      tag: 'div',
      parent: null,
      style: 'position: relative; overflow: hidden',
    });
    addNode(doc, root);
    addPage(doc, { name: 'Test', rootNodeId: 'root', mode: 'light' });

    const result = exportReact(doc);
    expect(result.code).toContain('relative');
    expect(result.code).toContain('overflow-hidden');
  });

  it('maps display none to hidden', () => {
    const doc = createDocument({ name: 'Test' });
    const root = createNode({
      id: 'root',
      tag: 'div',
      parent: null,
      style: 'display: none',
    });
    addNode(doc, root);
    addPage(doc, { name: 'Test', rootNodeId: 'root', mode: 'light' });

    const result = exportReact(doc);
    expect(result.code).toContain('hidden');
  });

  it('maps rem values to Tailwind spacing', () => {
    const doc = createDocument({ name: 'Test' });
    const root = createNode({
      id: 'root',
      tag: 'div',
      parent: null,
      style: 'padding: 1rem; gap: 0.5rem',
    });
    addNode(doc, root);
    addPage(doc, { name: 'Test', rootNodeId: 'root', mode: 'light' });

    const result = exportReact(doc);
    expect(result.code).toContain('p-4');
    expect(result.code).toContain('gap-2');
  });
});
