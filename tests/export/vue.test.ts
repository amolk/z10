/**
 * Tests for Vue 3 SFC export.
 *
 * E6: Tests use DOM elements (happy-dom) instead of Z10Document.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportVue, type ExportVueOptions } from '../../src/export/vue.js';
import { Window } from 'happy-dom';
import type { ComponentSchema } from '../../src/core/types.js';
import type { ExportContext } from '../../src/export/react.js';

function buildTestDom(): { root: Element; context: ExportContext; cleanup: () => void } {
  const win = new Window();
  const doc = win.document;

  doc.body.innerHTML = `
    <div data-z10-page="Dashboard" data-z10-id="page_root" style="width: 1440px; min-height: 900px">
      <header data-z10-id="header" style="display: flex; justify-content: space-between; padding: 16px">
        <h1 data-z10-id="title" style="font-size: 24px; font-weight: 700">My App</h1>
        <div data-z10-id="save_btn" data-z10-component="Button" data-z10-props='{"label":"Save","variant":"primary"}'></div>
      </header>
      <main data-z10-id="content" style="padding: 32px; display: grid; gap: 16px">
        <div data-z10-id="card" style="border-radius: 8px; padding: 24px; background: var(--bg)">
          <p data-z10-id="card_text" style="font-size: 16px; color: var(--text)">Hello world</p>
        </div>
      </main>
    </div>
  `;

  const buttonSchema: ComponentSchema = {
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
  };

  const primitives = new Map([
    ['--blue-500', { name: '--blue-500', value: '#3b82f6', collection: 'primitives' as const }],
    ['--gray-900', { name: '--gray-900', value: '#111827', collection: 'primitives' as const }],
  ]);
  const semantic = new Map([
    ['--primary', { name: '--primary', value: 'var(--blue-500)', collection: 'semantic' as const }],
    ['--text', { name: '--text', value: 'var(--gray-900)', collection: 'semantic' as const }],
  ]);

  return {
    root: doc.body as unknown as Element,
    context: {
      components: [buttonSchema],
      tokens: { primitives, semantic },
    },
    cleanup: () => win.close(),
  };
}

describe('exportVue', () => {
  let root: Element;
  let context: ExportContext;
  let cleanup: () => void;

  beforeEach(() => {
    ({ root, context, cleanup } = buildTestDom());
  });

  afterEach(() => {
    cleanup();
  });

  it('exports a full document as Vue SFC', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain('<template>');
    expect(result.components.length).toBeGreaterThan(0);
  });

  it('exports component definitions with script setup', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain('<script setup lang="ts">');
    expect(result.code).toContain('interface ButtonProps');
    expect(result.code).toContain('label: string');
    expect(result.code).toContain("'primary' | 'secondary'");
    expect(result.code).toContain('disabled?: boolean');
  });

  it('uses withDefaults for props with defaults', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain('withDefaults(defineProps<ButtonProps>()');
    expect(result.code).toContain('variant: "primary"');
    expect(result.code).toContain('disabled: false');
  });

  it('exports pages with template section', () => {
    const result = exportVue(root, { context });
    expect(result.components).toContain('Dashboard');
    expect(result.code).toContain('<template>');
  });

  it('converts CSS to Tailwind classes in Vue templates', () => {
    const result = exportVue(root, { context });
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
    const result = exportVue(root, { context });
    expect(result.code).toContain('class="');
    expect(result.code).not.toContain('className=');
  });

  it('falls back to :style binding for non-Tailwind values', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain(':style=');
    expect(result.code).toContain("'background'");
    expect(result.code).toContain("'var(--bg)'");
  });

  it('renders component instances', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain('<Button');
    expect(result.code).toContain('label=');
    expect(result.code).toContain('variant=');
  });

  it('renders text content', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain('My App');
    expect(result.code).toContain('Hello world');
  });

  it('generates tokens CSS', () => {
    const result = exportVue(root, { includeTokens: true, context });
    expect(result.tokensCss).toBeDefined();
    expect(result.tokensCss).toContain('--blue-500: #3b82f6');
    expect(result.tokensCss).toContain('--primary: var(--blue-500)');
    expect(result.tokensCss).toContain(':root');
  });

  it('exports a specific subtree by selector', () => {
    const result = exportVue(root, { selector: '[data-z10-id="content"]', context });
    expect(result.components).toContain('Content');
    expect(result.code).toContain('<main');
    expect(result.code).not.toContain('justify-between');
  });

  it('returns error comment for unknown selector', () => {
    const result = exportVue(root, { selector: '[data-z10-id="nonexistent"]', context });
    expect(result.code).toContain('Error: Element not found');
    expect(result.components).toEqual([]);
  });

  it('omits tokens CSS when includeTokens is false', () => {
    const result = exportVue(root, { includeTokens: false, context });
    expect(result.tokensCss).toBeUndefined();
  });

  it('generates JavaScript when typescript is false', () => {
    const result = exportVue(root, { typescript: false, context });
    expect(result.code).not.toContain('interface ButtonProps');
    expect(result.code).toContain('defineProps({');
    expect(result.code).toContain('type: String');
    expect(result.code).toContain('type: Boolean');
    expect(result.code).not.toContain('lang="ts"');
  });

  it('handles empty element', () => {
    const win = new Window();
    win.document.body.innerHTML = '';
    const emptyRoot = win.document.body as unknown as Element;
    const result = exportVue(emptyRoot);
    expect(result.components).toEqual(['Body']);
    win.close();
  });

  it('converts template variables to Vue interpolation', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain('{{ label }}');
    expect(result.code).not.toContain('{{label}}');
  });

  it('includes scoped styles for components', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain('<style scoped>');
    expect(result.code).toContain('.btn { padding: 8px 16px;');
  });

  it('includes component in components list', () => {
    const result = exportVue(root, { context });
    expect(result.components).toContain('Button');
    expect(result.components).toContain('Dashboard');
  });

  it('imports used components in page script setup', () => {
    const result = exportVue(root, { context });
    expect(result.code).toContain("import Button from './Button.vue'");
  });
});
