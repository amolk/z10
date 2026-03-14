/**
 * Export DOM trees to React + Tailwind code.
 *
 * E6: Migrated from Z10Document/Z10Node to DOM Element input.
 * Converts DOM elements into functional React components using Tailwind CSS
 * utility classes where possible, falling back to inline styles for
 * values that don't map cleanly to Tailwind.
 */

import type { ComponentSchema, StyleMap } from '../core/types.js';
import { stripForExport } from '../dom/strip.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Shared export context for component schemas and design tokens */
export interface ExportContext {
  /** Component schemas for generating typed component definitions */
  components?: ComponentSchema[];
  /** Design token maps for CSS custom property export */
  tokens?: {
    primitives?: Map<string, { name: string; value: string }>;
    semantic?: Map<string, { name: string; value: string }>;
  };
}

export interface ExportReactOptions {
  /** CSS selector for subtree root (omit for full element) */
  selector?: string;
  /** Include design tokens as CSS variables (default: true) */
  includeTokens?: boolean;
  /** Use TypeScript (default: true) */
  typescript?: boolean;
  /** Component schemas and token context */
  context?: ExportContext;
}

export interface ExportReactResult {
  /** The generated React component code */
  code: string;
  /** Component names that were exported */
  components: string[];
  /** Tokens CSS if includeTokens is true */
  tokensCss?: string;
}

/** Export a DOM element (or subtree) to React + Tailwind code */
export function exportReact(root: Element, options: ExportReactOptions = {}): ExportReactResult {
  const { selector, includeTokens = true, typescript = true, context = {} } = options;
  const components: string[] = [];
  const parts: string[] = [];

  // Imports
  parts.push(`import React from 'react';`);
  parts.push('');

  // Export component definitions from context
  if (context.components) {
    for (const schema of context.components) {
      parts.push(generateComponentDefinition(schema, typescript));
      parts.push('');
      components.push(schema.name);
    }
  }

  // Export subtree or full element
  if (selector) {
    const target = root.querySelector(selector);
    if (!target) {
      return { code: `// Error: Element not found: ${selector}`, components: [] };
    }
    const stripped = stripForExport(target);
    const name = elementToComponentName(target);
    parts.push(generateElementComponent(stripped, name, typescript));
    components.push(name);
  } else {
    // Check for page containers (data-z10-page divs)
    const pages = root.querySelectorAll('[data-z10-page]');
    if (pages.length > 0) {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as Element;
        const stripped = stripForExport(page);
        const pageName = toPascalCase(page.getAttribute('data-z10-page') || `Page${i + 1}`);
        parts.push(generateElementComponent(stripped, pageName, typescript));
        parts.push('');
        components.push(pageName);
      }
    } else {
      // Export the root element itself
      const stripped = stripForExport(root);
      const name = elementToComponentName(root);
      parts.push(generateElementComponent(stripped, name, typescript));
      components.push(name);
    }
  }

  // Tokens CSS
  let tokensCss: string | undefined;
  if (includeTokens && context.tokens) {
    tokensCss = generateTokensCss(context.tokens);
  }

  return {
    code: parts.filter(Boolean).join('\n'),
    components,
    tokensCss,
  };
}

// ---------------------------------------------------------------------------
// Component Definition Generator (from schemas)
// ---------------------------------------------------------------------------

function generateComponentDefinition(schema: ComponentSchema, typescript: boolean): string {
  const lines: string[] = [];
  const propsType = `${schema.name}Props`;

  // Props interface (TypeScript only)
  if (typescript && schema.props.length > 0) {
    lines.push(`interface ${propsType} {`);
    for (const prop of schema.props) {
      const optional = prop.required ? '' : '?';
      const tsType = propTypeToTs(prop.type, prop.options);
      lines.push(`  ${prop.name}${optional}: ${tsType};`);
    }
    lines.push('}');
    lines.push('');
  }

  // Component function
  const propsArg = schema.props.length > 0
    ? typescript ? `props: ${propsType}` : 'props'
    : '';

  lines.push(`export function ${schema.name}(${propsArg ? `{ ${schema.props.map(p => {
    if (p.default !== undefined) {
      return `${p.name} = ${JSON.stringify(p.default)}`;
    }
    return p.name;
  }).join(', ')} }${typescript ? `: ${propsType}` : ''}` : ''}) {`);

  // Convert template to JSX
  if (schema.template) {
    const jsx = templateToJsx(schema.template);
    lines.push(`  return (`);
    lines.push(`    ${jsx}`);
    lines.push(`  );`);
  } else {
    lines.push(`  return <div className="${toKebabCase(schema.name)}">{/* ${schema.name} */}</div>;`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DOM Element → React Component
// ---------------------------------------------------------------------------

function generateElementComponent(root: Element, name: string, _typescript: boolean): string {
  const lines: string[] = [];

  lines.push(`export function ${name}() {`);
  lines.push('  return (');
  lines.push(renderElement(root, 2));
  lines.push('  );');
  lines.push('}');

  return lines.join('\n');
}

function renderElement(el: Element, indent: number): string {
  const pad = '  '.repeat(indent);
  const children = Array.from(el.children);

  // If this is a component instance, render as component
  const componentName = el.getAttribute('data-z10-component');
  if (componentName) {
    return renderComponentInstance(el, componentName, indent);
  }

  // Map HTML tag
  const tag = el.tagName.toLowerCase();

  // Build className and style
  const styles = parseInlineStyle(el.getAttribute('style') || '');
  const { className, style } = stylesToTailwind(styles);
  const attrs = buildJsxAttributes(el, className, style);

  // Get direct text content (not from child elements)
  const textContent = getDirectTextContent(el);

  if (children.length === 0 && !textContent) {
    return `${pad}<${tag}${attrs} />`;
  }

  const parts: string[] = [];
  parts.push(`${pad}<${tag}${attrs}>`);

  if (textContent) {
    parts.push(`${pad}  ${escapeJsx(textContent)}`);
  }

  for (const child of children) {
    parts.push(renderElement(child, indent + 1));
  }

  parts.push(`${pad}</${tag}>`);
  return parts.join('\n');
}

function renderComponentInstance(el: Element, componentName: string, indent: number): string {
  const pad = '  '.repeat(indent);

  // Try to read props from data-z10-props attribute
  const propsAttr = el.getAttribute('data-z10-props');
  const props: Record<string, string | number | boolean> = propsAttr
    ? JSON.parse(propsAttr)
    : {};

  const propEntries = Object.entries(props);
  if (propEntries.length === 0) {
    return `${pad}<${componentName} />`;
  }

  const propsStr = propEntries
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}="${escapeJsx(value)}"`;
      return `${key}={${JSON.stringify(value)}}`;
    })
    .join(' ');

  return `${pad}<${componentName} ${propsStr} />`;
}

// ---------------------------------------------------------------------------
// CSS → Tailwind Conversion
// ---------------------------------------------------------------------------

const TAILWIND_MAP: Record<string, Record<string, string> | ((value: string) => string | null)> = {
  'display': {
    'flex': 'flex', 'grid': 'grid', 'block': 'block',
    'inline': 'inline', 'inline-block': 'inline-block',
    'inline-flex': 'inline-flex', 'none': 'hidden',
  },
  'flex-direction': {
    'row': 'flex-row', 'column': 'flex-col',
    'row-reverse': 'flex-row-reverse', 'column-reverse': 'flex-col-reverse',
  },
  'flex-wrap': {
    'wrap': 'flex-wrap', 'nowrap': 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse',
  },
  'justify-content': {
    'flex-start': 'justify-start', 'flex-end': 'justify-end',
    'center': 'justify-center', 'space-between': 'justify-between',
    'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
  },
  'align-items': {
    'flex-start': 'items-start', 'flex-end': 'items-end',
    'center': 'items-center', 'baseline': 'items-baseline', 'stretch': 'items-stretch',
  },
  'text-align': {
    'left': 'text-left', 'center': 'text-center',
    'right': 'text-right', 'justify': 'text-justify',
  },
  'position': {
    'relative': 'relative', 'absolute': 'absolute',
    'fixed': 'fixed', 'sticky': 'sticky', 'static': 'static',
  },
  'overflow': {
    'hidden': 'overflow-hidden', 'auto': 'overflow-auto',
    'scroll': 'overflow-scroll', 'visible': 'overflow-visible',
  },
  'font-weight': {
    '100': 'font-thin', '200': 'font-extralight', '300': 'font-light',
    '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold',
    '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black',
    'bold': 'font-bold', 'normal': 'font-normal',
  },
  'width': (v) => mapSpacingValue('w', v),
  'height': (v) => mapSpacingValue('h', v),
  'min-width': (v) => mapSpacingValue('min-w', v),
  'min-height': (v) => mapSpacingValue('min-h', v),
  'max-width': (v) => mapSpacingValue('max-w', v),
  'max-height': (v) => mapSpacingValue('max-h', v),
  'padding': (v) => mapSpacingValue('p', v),
  'padding-top': (v) => mapSpacingValue('pt', v),
  'padding-right': (v) => mapSpacingValue('pr', v),
  'padding-bottom': (v) => mapSpacingValue('pb', v),
  'padding-left': (v) => mapSpacingValue('pl', v),
  'margin': (v) => mapSpacingValue('m', v),
  'margin-top': (v) => mapSpacingValue('mt', v),
  'margin-right': (v) => mapSpacingValue('mr', v),
  'margin-bottom': (v) => mapSpacingValue('mb', v),
  'margin-left': (v) => mapSpacingValue('ml', v),
  'gap': (v) => mapSpacingValue('gap', v),
  'border-radius': (v) => mapBorderRadius(v),
  'font-size': (v) => mapFontSize(v),
};

function mapSpacingValue(prefix: string, value: string): string | null {
  if (value === '100%') return `${prefix}-full`;
  if (value === 'auto') return `${prefix}-auto`;
  if (value === '100vw' || value === '100vh') return `${prefix}-screen`;
  if (value === '0' || value === '0px') return `${prefix}-0`;

  const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (pxMatch) {
    const twValue = pxToTailwind(parseFloat(pxMatch[1]!));
    if (twValue !== null) return `${prefix}-${twValue}`;
  }

  const remMatch = value.match(/^(\d+(?:\.\d+)?)rem$/);
  if (remMatch) {
    const twValue = pxToTailwind(parseFloat(remMatch[1]!) * 16);
    if (twValue !== null) return `${prefix}-${twValue}`;
  }

  return null;
}

function pxToTailwind(px: number): string | null {
  const scale: Record<number, string> = {
    0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5',
    12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8',
    36: '9', 40: '10', 44: '11', 48: '12', 56: '14', 64: '16',
    80: '20', 96: '24', 112: '28', 128: '32', 144: '36', 160: '40',
    176: '44', 192: '48', 208: '52', 224: '56', 240: '60', 256: '64',
    288: '72', 320: '80', 384: '96',
  };
  return scale[px] ?? null;
}

function mapBorderRadius(value: string): string | null {
  const map: Record<string, string> = {
    '0': 'rounded-none', '0px': 'rounded-none',
    '2px': 'rounded-sm', '4px': 'rounded', '6px': 'rounded-md',
    '8px': 'rounded-lg', '12px': 'rounded-xl', '16px': 'rounded-2xl',
    '24px': 'rounded-3xl', '9999px': 'rounded-full', '50%': 'rounded-full',
  };
  return map[value] ?? null;
}

function mapFontSize(value: string): string | null {
  const map: Record<string, string> = {
    '12px': 'text-xs', '14px': 'text-sm', '16px': 'text-base',
    '18px': 'text-lg', '20px': 'text-xl', '24px': 'text-2xl',
    '30px': 'text-3xl', '36px': 'text-4xl', '48px': 'text-5xl',
    '60px': 'text-6xl', '72px': 'text-7xl', '96px': 'text-8xl',
    '128px': 'text-9xl',
    '0.75rem': 'text-xs', '0.875rem': 'text-sm', '1rem': 'text-base',
    '1.125rem': 'text-lg', '1.25rem': 'text-xl', '1.5rem': 'text-2xl',
    '1.875rem': 'text-3xl', '2.25rem': 'text-4xl', '3rem': 'text-5xl',
    '3.75rem': 'text-6xl', '4.5rem': 'text-7xl', '6rem': 'text-8xl',
    '8rem': 'text-9xl',
  };
  return map[value] ?? null;
}

function stylesToTailwind(styles: StyleMap): { className: string; style: StyleMap } {
  const classes: string[] = [];
  const remaining: StyleMap = {};

  for (const [prop, value] of Object.entries(styles)) {
    const mapping = TAILWIND_MAP[prop];
    let mapped = false;

    if (mapping) {
      if (typeof mapping === 'function') {
        const cls = mapping(value);
        if (cls) { classes.push(cls); mapped = true; }
      } else if (mapping[value]) {
        classes.push(mapping[value]); mapped = true;
      }
    }

    if (!mapped) {
      remaining[prop] = value;
    }
  }

  return { className: classes.join(' '), style: remaining };
}

// ---------------------------------------------------------------------------
// JSX Attribute Building
// ---------------------------------------------------------------------------

function buildJsxAttributes(el: Element, className: string, style: StyleMap): string {
  const attrs: string[] = [];

  if (className) {
    attrs.push(`className="${className}"`);
  }

  const styleEntries = Object.entries(style);
  if (styleEntries.length > 0) {
    const styleObj = styleEntries
      .map(([prop, value]) => `${toCamelCase(prop)}: '${value}'`)
      .join(', ');
    attrs.push(`style={{ ${styleObj} }}`);
  }

  // Add non-z10 attributes from the element
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name.startsWith('data-z10-')) continue;
    if (attr.name === 'style') continue; // already handled
    if (attr.name === 'class') continue; // mapped to className via Tailwind
    attrs.push(`${attr.name}="${escapeJsx(attr.value)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

// ---------------------------------------------------------------------------
// Template → JSX Conversion
// ---------------------------------------------------------------------------

function templateToJsx(template: string): string {
  let jsx = template.trim();

  // Convert class= to className=
  jsx = jsx.replace(/\bclass="/g, 'className="');

  // Convert style strings to style objects
  jsx = jsx.replace(/\bstyle="([^"]*)"/g, (_match, styleStr: string) => {
    const styleMap = parseInlineStyle(styleStr);
    if (Object.keys(styleMap).length === 0) return '';
    const obj = Object.entries(styleMap)
      .map(([k, v]) => `${toCamelCase(k)}: '${v}'`)
      .join(', ');
    return `style={{ ${obj} }}`;
  });

  // Convert template variables {{propName}} to {propName}
  jsx = jsx.replace(/\{\{(\w+)\}\}/g, '{$1}');

  // Self-close void elements
  jsx = jsx.replace(/<(img|br|hr|input)([^>]*?)(?<!\/)>/g, '<$1$2 />');

  return jsx;
}

// ---------------------------------------------------------------------------
// Tokens CSS Generation
// ---------------------------------------------------------------------------

function generateTokensCss(tokens: NonNullable<ExportContext['tokens']>): string {
  const lines: string[] = [];
  lines.push(':root {');

  if (tokens.primitives) {
    for (const token of tokens.primitives.values()) {
      lines.push(`  ${token.name}: ${token.value};`);
    }
  }
  if (tokens.semantic) {
    for (const token of tokens.semantic.values()) {
      lines.push(`  ${token.name}: ${token.value};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse inline style string to a StyleMap */
function parseInlineStyle(style: string): StyleMap {
  const result: StyleMap = {};
  for (const decl of style.split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (prop && value) result[prop] = value;
  }
  return result;
}

/** Get direct text content of an element, excluding child elements */
function getDirectTextContent(el: Element): string {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3 /* TEXT_NODE */) {
      text += child.textContent || '';
    }
  }
  return text.trim();
}

/** Derive a component name from an element */
function elementToComponentName(el: Element): string {
  const id = el.getAttribute('data-z10-id');
  const page = el.getAttribute('data-z10-page');
  return toPascalCase(page || id || el.tagName.toLowerCase());
}

function propTypeToTs(type: string, options?: string[]): string {
  switch (type) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'enum': return options ? options.map(o => `'${o}'`).join(' | ') : 'string';
    case 'slot': return 'React.ReactNode';
    default: return 'unknown';
  }
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function escapeJsx(str: string): string {
  return str.replace(/[{}"<>&]/g, (c) => {
    switch (c) {
      case '{': return '&#123;';
      case '}': return '&#125;';
      case '"': return '&quot;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      default: return c;
    }
  });
}
