/**
 * Tests for React + Tailwind export.
 *
 * E6: Tests use DOM elements (happy-dom) instead of Z10Document.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportReact, type ExportContext } from '../../src/export/react.js';
import { Window } from 'happy-dom';
import type { ComponentSchema } from '../../src/core/types.js';

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

describe('exportReact', () => {
  let root: Element;
  let context: ExportContext;
  let cleanup: () => void;

  beforeEach(() => {
    ({ root, context, cleanup } = buildTestDom());
  });

  afterEach(() => {
    cleanup();
  });

  it('exports a full document with imports', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain("import React from 'react'");
    expect(result.components.length).toBeGreaterThan(0);
  });

  it('exports component definitions with TypeScript props', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain('interface ButtonProps');
    expect(result.code).toContain('label: string');
    expect(result.code).toContain("'primary' | 'secondary'");
    expect(result.code).toContain('disabled?: boolean');
    expect(result.code).toContain('export function Button');
  });

  it('exports pages as React components', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain('export function Dashboard');
    expect(result.components).toContain('Dashboard');
  });

  it('converts CSS to Tailwind classes', () => {
    const result = exportReact(root, { context });
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

  it('falls back to inline styles for non-Tailwind values', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain("background: 'var(--bg)'");
    expect(result.code).toContain("color: 'var(--text)'");
  });

  it('renders component instances', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain('<Button');
    expect(result.code).toContain('label=');
    expect(result.code).toContain('variant=');
  });

  it('renders text content', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain('My App');
    expect(result.code).toContain('Hello world');
  });

  it('generates tokens CSS', () => {
    const result = exportReact(root, { includeTokens: true, context });
    expect(result.tokensCss).toBeDefined();
    expect(result.tokensCss).toContain('--blue-500: #3b82f6');
    expect(result.tokensCss).toContain('--primary: var(--blue-500)');
    expect(result.tokensCss).toContain(':root');
  });

  it('exports a specific subtree by selector', () => {
    const result = exportReact(root, { selector: '[data-z10-id="content"]', context });
    expect(result.code).toContain('export function Content');
    expect(result.code).not.toContain('justify-between');
  });

  it('returns error for unknown selector', () => {
    const result = exportReact(root, { selector: '[data-z10-id="nonexistent"]', context });
    expect(result.code).toContain('Error: Element not found');
    expect(result.components).toEqual([]);
  });

  it('omits tokens CSS when includeTokens is false', () => {
    const result = exportReact(root, { includeTokens: false, context });
    expect(result.tokensCss).toBeUndefined();
  });

  it('generates JavaScript when typescript is false', () => {
    const result = exportReact(root, { typescript: false, context });
    expect(result.code).not.toContain('interface ButtonProps');
    expect(result.code).toContain('export function Button');
  });

  it('handles empty element', () => {
    const win = new Window();
    win.document.body.innerHTML = '';
    const emptyRoot = win.document.body as unknown as Element;
    const result = exportReact(emptyRoot);
    expect(result.code).toContain("import React from 'react'");
    win.close();
  });

  it('converts template variables to JSX expressions', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain('{label}');
    expect(result.code).not.toContain('{{label}}');
  });

  it('converts class to className in templates', () => {
    const result = exportReact(root, { context });
    expect(result.code).toContain('className="btn"');
    expect(result.code).not.toMatch(/\bclass="btn"/);
  });

  it('includes component in components list', () => {
    const result = exportReact(root, { context });
    expect(result.components).toContain('Button');
    expect(result.components).toContain('Dashboard');
  });
});

describe('Tailwind CSS mapping', () => {
  it('maps spacing values correctly', () => {
    const win = new Window();
    win.document.body.innerHTML = '<div data-z10-page="Test" data-z10-id="root" style="width: 100%; height: 100vh; margin: 0"></div>';
    const root = win.document.body as unknown as Element;

    const result = exportReact(root);
    expect(result.code).toContain('w-full');
    expect(result.code).toContain('h-screen');
    expect(result.code).toContain('m-0');
    win.close();
  });

  it('maps position and overflow', () => {
    const win = new Window();
    win.document.body.innerHTML = '<div data-z10-page="Test" data-z10-id="root" style="position: relative; overflow: hidden"></div>';
    const root = win.document.body as unknown as Element;

    const result = exportReact(root);
    expect(result.code).toContain('relative');
    expect(result.code).toContain('overflow-hidden');
    win.close();
  });

  it('maps display none to hidden', () => {
    const win = new Window();
    win.document.body.innerHTML = '<div data-z10-page="Test" data-z10-id="root" style="display: none"></div>';
    const root = win.document.body as unknown as Element;

    const result = exportReact(root);
    expect(result.code).toContain('hidden');
    win.close();
  });

  it('maps rem values to Tailwind spacing', () => {
    const win = new Window();
    win.document.body.innerHTML = '<div data-z10-page="Test" data-z10-id="root" style="padding: 1rem; gap: 0.5rem"></div>';
    const root = win.document.body as unknown as Element;

    const result = exportReact(root);
    expect(result.code).toContain('p-4');
    expect(result.code).toContain('gap-2');
    win.close();
  });
});
