/**
 * Tests for Vue 3 SFC export.
 *
 * Validates conversion of Z10 document structures to Vue 3 Single File
 * Components with Composition API and Tailwind CSS utility classes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { exportVue } from '../../src/export/vue.js';
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

describe('exportVue', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = buildTestDoc();
  });

  it('exports a full document as Vue SFC', () => {
    const result = exportVue(doc);
    expect(result.code).toContain('<template>');
    expect(result.components.length).toBeGreaterThan(0);
  });

  it('exports component definitions with script setup', () => {
    const result = exportVue(doc);
    expect(result.code).toContain('<script setup lang="ts">');
    expect(result.code).toContain('interface ButtonProps');
    expect(result.code).toContain('label: string');
    expect(result.code).toContain("'primary' | 'secondary'");
    expect(result.code).toContain('disabled?: boolean');
  });

  it('uses withDefaults for props with defaults', () => {
    const result = exportVue(doc);
    expect(result.code).toContain('withDefaults(defineProps<ButtonProps>()');
    expect(result.code).toContain('variant: "primary"');
    expect(result.code).toContain('disabled: false');
  });

  it('exports pages with template section', () => {
    const result = exportVue(doc);
    expect(result.components).toContain('Dashboard');
    // Page should have <template> block
    const dashboardSection = result.code.split('<script setup')[0]; // First part before any script
    expect(result.code).toContain('<template>');
  });

  it('converts CSS to Tailwind classes in Vue templates', () => {
    const result = exportVue(doc);
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

  it('uses class= instead of className=', () => {
    const result = exportVue(doc);
    // Vue uses class=, not className=
    expect(result.code).toContain('class="');
    expect(result.code).not.toContain('className=');
  });

  it('falls back to :style binding for non-Tailwind values', () => {
    const result = exportVue(doc);
    // background: var(--bg) should be in :style binding
    expect(result.code).toContain(":style=");
    expect(result.code).toContain("'background'");
    expect(result.code).toContain("'var(--bg)'");
  });

  it('renders component instances', () => {
    const result = exportVue(doc);
    expect(result.code).toContain('<Button');
    expect(result.code).toContain('label=');
    expect(result.code).toContain('variant=');
  });

  it('renders text content', () => {
    const result = exportVue(doc);
    expect(result.code).toContain('My App');
    expect(result.code).toContain('Hello world');
  });

  it('generates tokens CSS', () => {
    const result = exportVue(doc, { includeTokens: true });
    expect(result.tokensCss).toBeDefined();
    expect(result.tokensCss).toContain('--blue-500: #3b82f6');
    expect(result.tokensCss).toContain('--primary: var(--blue-500)');
    expect(result.tokensCss).toContain(':root');
  });

  it('exports a specific subtree by ID', () => {
    const result = exportVue(doc, { id: 'content' });
    expect(result.components).toContain('Content');
    // Should contain the content node's template
    expect(result.code).toContain('<main');
    // Should not include header
    expect(result.code).not.toContain('justify-between');
  });

  it('returns error comment for unknown node ID', () => {
    const result = exportVue(doc, { id: 'nonexistent' });
    expect(result.code).toContain('Error: Node not found');
    expect(result.components).toEqual([]);
  });

  it('omits tokens CSS when includeTokens is false', () => {
    const result = exportVue(doc, { includeTokens: false });
    expect(result.tokensCss).toBeUndefined();
  });

  it('generates JavaScript when typescript is false', () => {
    const result = exportVue(doc, { typescript: false });
    // Should not have TypeScript interface
    expect(result.code).not.toContain('interface ButtonProps');
    // Should use JS-style defineProps
    expect(result.code).toContain('defineProps({');
    expect(result.code).toContain('type: String');
    expect(result.code).toContain('type: Boolean');
    // No lang="ts"
    expect(result.code).not.toContain('lang="ts"');
  });

  it('handles empty document', () => {
    const emptyDoc = createDocument({ name: 'Empty' });
    const result = exportVue(emptyDoc);
    expect(result.components).toEqual([]);
  });

  it('converts template variables to Vue interpolation', () => {
    const result = exportVue(doc);
    // {{label}} should become {{ label }} (with spaces)
    expect(result.code).toContain('{{ label }}');
    expect(result.code).not.toContain('{{label}}');
  });

  it('includes scoped styles for components', () => {
    const result = exportVue(doc);
    expect(result.code).toContain('<style scoped>');
    expect(result.code).toContain('.btn { padding: 8px 16px;');
  });

  it('includes component in components list', () => {
    const result = exportVue(doc);
    expect(result.components).toContain('Button');
    expect(result.components).toContain('Dashboard');
  });

  it('imports used components in page script setup', () => {
    const result = exportVue(doc);
    // Dashboard uses Button, so it should import it
    expect(result.code).toContain("import Button from './Button.vue'");
  });
});
