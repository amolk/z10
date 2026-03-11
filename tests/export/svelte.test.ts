/**
 * Tests for Svelte export.
 *
 * Validates conversion of Z10 document structures to Svelte components
 * with Tailwind CSS utility classes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { exportSvelte } from '../../src/export/svelte.js';
import {
  createDocument,
  addNode,
  createNode,
  addPage,
  setTokens,
  setComponent,
} from '../../src/core/document.js';
import type { Z10Document } from '../../src/core/types.js';

function buildTestDoc(): Z10Document {
  const doc = createDocument({ name: 'TestApp' });

  setTokens(doc, 'primitives', {
    '--blue-500': '#3b82f6',
    '--gray-900': '#111827',
  });
  setTokens(doc, 'semantic', {
    '--primary': 'var(--blue-500)',
    '--text': 'var(--gray-900)',
  });

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

describe('exportSvelte', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = buildTestDoc();
  });

  it('exports a full document as Svelte components', () => {
    const result = exportSvelte(doc);
    expect(result.components.length).toBeGreaterThan(0);
    expect(result.components).toContain('Button');
    expect(result.components).toContain('Dashboard');
  });

  it('exports component with script tag and export let props', () => {
    const result = exportSvelte(doc);
    expect(result.code).toContain('<script lang="ts">');
    expect(result.code).toContain('export let label: string;');
    expect(result.code).toContain("export let variant: 'primary' | 'secondary' = \"primary\";");
    expect(result.code).toContain('export let disabled: boolean = false;');
  });

  it('converts CSS to Tailwind classes', () => {
    const result = exportSvelte(doc);
    expect(result.code).toContain('flex');
    expect(result.code).toContain('justify-between');
    expect(result.code).toContain('p-4');
    expect(result.code).toContain('text-2xl');
    expect(result.code).toContain('font-bold');
    expect(result.code).toContain('grid');
    expect(result.code).toContain('gap-4');
    expect(result.code).toContain('rounded-lg');
    expect(result.code).toContain('p-6');
    expect(result.code).toContain('p-8');
  });

  it('uses class= (not className=) in Svelte templates', () => {
    const result = exportSvelte(doc);
    expect(result.code).toContain('class="');
    expect(result.code).not.toContain('className=');
  });

  it('falls back to inline style for non-Tailwind values', () => {
    const result = exportSvelte(doc);
    // Svelte uses plain style= attribute
    expect(result.code).toContain('style="background: var(--bg)"');
  });

  it('renders component instances', () => {
    const result = exportSvelte(doc);
    expect(result.code).toContain('<Button');
    expect(result.code).toContain('label=');
    expect(result.code).toContain('variant=');
  });

  it('renders text content', () => {
    const result = exportSvelte(doc);
    expect(result.code).toContain('My App');
    expect(result.code).toContain('Hello world');
  });

  it('generates tokens CSS', () => {
    const result = exportSvelte(doc, { includeTokens: true });
    expect(result.tokensCss).toBeDefined();
    expect(result.tokensCss).toContain('--blue-500: #3b82f6');
    expect(result.tokensCss).toContain('--primary: var(--blue-500)');
    expect(result.tokensCss).toContain(':root');
  });

  it('exports a specific subtree by ID', () => {
    const result = exportSvelte(doc, { id: 'content' });
    expect(result.components).toContain('Content');
    expect(result.code).toContain('<main');
    expect(result.code).not.toContain('justify-between');
  });

  it('returns error comment for unknown node ID', () => {
    const result = exportSvelte(doc, { id: 'nonexistent' });
    expect(result.code).toContain('Error: Node not found');
    expect(result.components).toEqual([]);
  });

  it('omits tokens CSS when includeTokens is false', () => {
    const result = exportSvelte(doc, { includeTokens: false });
    expect(result.tokensCss).toBeUndefined();
  });

  it('generates JavaScript when typescript is false', () => {
    const result = exportSvelte(doc, { typescript: false });
    expect(result.code).not.toContain('lang="ts"');
    // JS mode uses export let without type annotations
    expect(result.code).toContain('export let label;');
    expect(result.code).toContain('export let variant = "primary";');
  });

  it('handles empty document', () => {
    const emptyDoc = createDocument({ name: 'Empty' });
    const result = exportSvelte(emptyDoc);
    expect(result.components).toEqual([]);
  });

  it('converts template variables to Svelte expressions', () => {
    const result = exportSvelte(doc);
    // {{label}} should become {label}
    expect(result.code).toContain('{label}');
    expect(result.code).not.toContain('{{label}}');
  });

  it('includes styles block for components', () => {
    const result = exportSvelte(doc);
    expect(result.code).toContain('<style>');
    expect(result.code).toContain('.btn { padding: 8px 16px;');
  });

  it('imports used components in page script', () => {
    const result = exportSvelte(doc);
    expect(result.code).toContain("import Button from './Button.svelte'");
  });
});
