/**
 * Tests for Svelte export.
 *
 * E6: Tests use DOM elements (happy-dom) instead of Z10Document.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportSvelte } from '../../src/export/svelte.js';
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

describe('exportSvelte', () => {
  let root: Element;
  let context: ExportContext;
  let cleanup: () => void;

  beforeEach(() => {
    ({ root, context, cleanup } = buildTestDom());
  });

  afterEach(() => {
    cleanup();
  });

  it('exports a full document as Svelte components', () => {
    const result = exportSvelte(root, { context });
    expect(result.components.length).toBeGreaterThan(0);
    expect(result.components).toContain('Button');
    expect(result.components).toContain('Dashboard');
  });

  it('exports component with script tag and export let props', () => {
    const result = exportSvelte(root, { context });
    expect(result.code).toContain('<script lang="ts">');
    expect(result.code).toContain('export let label: string;');
    expect(result.code).toContain("export let variant: 'primary' | 'secondary' = \"primary\";");
    expect(result.code).toContain('export let disabled: boolean = false;');
  });

  it('converts CSS to Tailwind classes', () => {
    const result = exportSvelte(root, { context });
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
    const result = exportSvelte(root, { context });
    expect(result.code).toContain('class="');
    expect(result.code).not.toContain('className=');
  });

  it('falls back to inline style for non-Tailwind values', () => {
    const result = exportSvelte(root, { context });
    expect(result.code).toContain('style="background: var(--bg)"');
  });

  it('renders component instances', () => {
    const result = exportSvelte(root, { context });
    expect(result.code).toContain('<Button');
    expect(result.code).toContain('label=');
    expect(result.code).toContain('variant=');
  });

  it('renders text content', () => {
    const result = exportSvelte(root, { context });
    expect(result.code).toContain('My App');
    expect(result.code).toContain('Hello world');
  });

  it('generates tokens CSS', () => {
    const result = exportSvelte(root, { includeTokens: true, context });
    expect(result.tokensCss).toBeDefined();
    expect(result.tokensCss).toContain('--blue-500: #3b82f6');
    expect(result.tokensCss).toContain('--primary: var(--blue-500)');
    expect(result.tokensCss).toContain(':root');
  });

  it('exports a specific subtree by selector', () => {
    const result = exportSvelte(root, { selector: '[data-z10-id="content"]', context });
    expect(result.components).toContain('Content');
    expect(result.code).toContain('<main');
    expect(result.code).not.toContain('justify-between');
  });

  it('returns error comment for unknown selector', () => {
    const result = exportSvelte(root, { selector: '[data-z10-id="nonexistent"]', context });
    expect(result.code).toContain('Error: Element not found');
    expect(result.components).toEqual([]);
  });

  it('omits tokens CSS when includeTokens is false', () => {
    const result = exportSvelte(root, { includeTokens: false, context });
    expect(result.tokensCss).toBeUndefined();
  });

  it('generates JavaScript when typescript is false', () => {
    const result = exportSvelte(root, { typescript: false, context });
    expect(result.code).not.toContain('lang="ts"');
    expect(result.code).toContain('export let label;');
    expect(result.code).toContain('export let variant = "primary";');
  });

  it('handles empty element', () => {
    const win = new Window();
    win.document.body.innerHTML = '';
    const emptyRoot = win.document.body as unknown as Element;
    const result = exportSvelte(emptyRoot);
    expect(result.components).toEqual(['Body']);
    win.close();
  });

  it('converts template variables to Svelte expressions', () => {
    const result = exportSvelte(root, { context });
    expect(result.code).toContain('{label}');
    expect(result.code).not.toContain('{{label}}');
  });

  it('includes styles block for components', () => {
    const result = exportSvelte(root, { context });
    expect(result.code).toContain('<style>');
    expect(result.code).toContain('.btn { padding: 8px 16px;');
  });

  it('imports used components in page script', () => {
    const result = exportSvelte(root, { context });
    expect(result.code).toContain("import Button from './Button.svelte'");
  });
});
