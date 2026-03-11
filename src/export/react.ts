/**
 * Export Z10 documents to React + Tailwind code.
 *
 * Converts Z10 nodes into functional React components using Tailwind CSS
 * utility classes where possible, falling back to inline styles for
 * values that don't map cleanly to Tailwind.
 *
 * PRD Section 2.10: export_react(id?) — Generate React/Tailwind
 * PRD Phase 2: Export to React + Tailwind
 */

import type {
  Z10Document,
  Z10Node,
  NodeId,
  ComponentSchema,
  StyleMap,
} from '../core/types.js';
import { getNode, getChildren, getComponent } from '../core/document.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExportReactOptions {
  /** Node ID to export (omit for full document) */
  id?: NodeId;
  /** Include design tokens as CSS variables (default: true) */
  includeTokens?: boolean;
  /** Use TypeScript (default: true) */
  typescript?: boolean;
}

export interface ExportReactResult {
  /** The generated React component code */
  code: string;
  /** Component names that were exported */
  components: string[];
  /** Tokens CSS if includeTokens is true */
  tokensCss?: string;
}

/** Export a Z10 document (or subtree) to React + Tailwind code */
export function exportReact(doc: Z10Document, options: ExportReactOptions = {}): ExportReactResult {
  const { id, includeTokens = true, typescript = true } = options;
  const components: string[] = [];
  const parts: string[] = [];

  // Imports
  parts.push(`import React from 'react';`);
  parts.push('');

  // Export component definitions first
  for (const schema of doc.components.values()) {
    parts.push(generateComponentDefinition(schema, typescript));
    parts.push('');
    components.push(schema.name);
  }

  // Export pages or a specific subtree
  if (id) {
    const node = getNode(doc, id);
    if (!node) {
      return { code: `// Error: Node not found: ${id}`, components: [] };
    }
    const pageName = toPascalCase(node.id);
    parts.push(generateNodeComponent(doc, node, pageName, typescript));
    components.push(pageName);
  } else {
    for (const page of doc.pages) {
      const root = doc.nodes.get(page.rootNodeId);
      if (!root) continue;
      const pageName = toPascalCase(page.name);
      parts.push(generateNodeComponent(doc, root, pageName, typescript));
      parts.push('');
      components.push(pageName);
    }
  }

  // Tokens CSS
  let tokensCss: string | undefined;
  if (includeTokens) {
    tokensCss = generateTokensCss(doc);
  }

  return {
    code: parts.filter(Boolean).join('\n'),
    components,
    tokensCss,
  };
}

// ---------------------------------------------------------------------------
// Component Definition Generator
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
    const jsx = templateToJsx(schema.template, schema);
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
// Node Tree → React Component
// ---------------------------------------------------------------------------

function generateNodeComponent(doc: Z10Document, root: Z10Node, name: string, typescript: boolean): string {
  const lines: string[] = [];

  lines.push(`export function ${name}() {`);
  lines.push('  return (');
  lines.push(renderNode(doc, root, 2));
  lines.push('  );');
  lines.push('}');

  return lines.join('\n');
}

function renderNode(doc: Z10Document, node: Z10Node, indent: number): string {
  const pad = '  '.repeat(indent);
  const children = getChildren(doc, node.id);

  // If this is a component instance, render as component
  if (node.componentName) {
    return renderComponentInstance(doc, node, indent);
  }

  // Map HTML tag
  const tag = mapHtmlTag(node.tag);

  // Build className and style
  const { className, style } = stylesToTailwind(node.styles);
  const attrs = buildJsxAttributes(node, className, style);

  if (children.length === 0 && !node.textContent) {
    return `${pad}<${tag}${attrs} />`;
  }

  const parts: string[] = [];
  parts.push(`${pad}<${tag}${attrs}>`);

  if (node.textContent) {
    parts.push(`${pad}  ${escapeJsx(node.textContent)}`);
  }

  for (const child of children) {
    parts.push(renderNode(doc, child, indent + 1));
  }

  parts.push(`${pad}</${tag}>`);
  return parts.join('\n');
}

function renderComponentInstance(doc: Z10Document, node: Z10Node, indent: number): string {
  const pad = '  '.repeat(indent);
  const componentName = node.componentName!;
  const props = node.componentProps ?? {};

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

/**
 * CSS-to-Tailwind mapping. Maps CSS property+value pairs to Tailwind classes.
 * Falls back to inline styles for unmapped values.
 */
const TAILWIND_MAP: Record<string, Record<string, string> | ((value: string) => string | null)> = {
  'display': {
    'flex': 'flex',
    'grid': 'grid',
    'block': 'block',
    'inline': 'inline',
    'inline-block': 'inline-block',
    'inline-flex': 'inline-flex',
    'none': 'hidden',
  },
  'flex-direction': {
    'row': 'flex-row',
    'column': 'flex-col',
    'row-reverse': 'flex-row-reverse',
    'column-reverse': 'flex-col-reverse',
  },
  'flex-wrap': {
    'wrap': 'flex-wrap',
    'nowrap': 'flex-nowrap',
    'wrap-reverse': 'flex-wrap-reverse',
  },
  'justify-content': {
    'flex-start': 'justify-start',
    'flex-end': 'justify-end',
    'center': 'justify-center',
    'space-between': 'justify-between',
    'space-around': 'justify-around',
    'space-evenly': 'justify-evenly',
  },
  'align-items': {
    'flex-start': 'items-start',
    'flex-end': 'items-end',
    'center': 'items-center',
    'baseline': 'items-baseline',
    'stretch': 'items-stretch',
  },
  'text-align': {
    'left': 'text-left',
    'center': 'text-center',
    'right': 'text-right',
    'justify': 'text-justify',
  },
  'position': {
    'relative': 'relative',
    'absolute': 'absolute',
    'fixed': 'fixed',
    'sticky': 'sticky',
    'static': 'static',
  },
  'overflow': {
    'hidden': 'overflow-hidden',
    'auto': 'overflow-auto',
    'scroll': 'overflow-scroll',
    'visible': 'overflow-visible',
  },
  'font-weight': {
    '100': 'font-thin',
    '200': 'font-extralight',
    '300': 'font-light',
    '400': 'font-normal',
    '500': 'font-medium',
    '600': 'font-semibold',
    '700': 'font-bold',
    '800': 'font-extrabold',
    '900': 'font-black',
    'bold': 'font-bold',
    'normal': 'font-normal',
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

/** Map spacing values (px/rem) to Tailwind spacing scale */
function mapSpacingValue(prefix: string, value: string): string | null {
  // Handle special keywords
  if (value === '100%') return `${prefix}-full`;
  if (value === 'auto') return `${prefix}-auto`;
  if (value === '100vw') return `${prefix}-screen`;
  if (value === '100vh') return `${prefix}-screen`;
  if (value === '0' || value === '0px') return `${prefix}-0`;

  // Handle px values → Tailwind 4px scale
  const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (pxMatch) {
    const px = parseFloat(pxMatch[1]!);
    const twValue = pxToTailwind(px);
    if (twValue !== null) return `${prefix}-${twValue}`;
  }

  // Handle rem values
  const remMatch = value.match(/^(\d+(?:\.\d+)?)rem$/);
  if (remMatch) {
    const rem = parseFloat(remMatch[1]!);
    const px = rem * 16;
    const twValue = pxToTailwind(px);
    if (twValue !== null) return `${prefix}-${twValue}`;
  }

  return null;
}

/** Convert px value to Tailwind spacing unit */
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

/** Convert a StyleMap to Tailwind classes + remaining inline styles */
function stylesToTailwind(styles: StyleMap): { className: string; style: StyleMap } {
  const classes: string[] = [];
  const remaining: StyleMap = {};

  for (const [prop, value] of Object.entries(styles)) {
    const mapping = TAILWIND_MAP[prop];
    let mapped = false;

    if (mapping) {
      if (typeof mapping === 'function') {
        const cls = mapping(value);
        if (cls) {
          classes.push(cls);
          mapped = true;
        }
      } else if (mapping[value]) {
        classes.push(mapping[value]);
        mapped = true;
      }
    }

    if (!mapped) {
      remaining[prop] = value;
    }
  }

  return {
    className: classes.join(' '),
    style: remaining,
  };
}

// ---------------------------------------------------------------------------
// JSX Attribute Building
// ---------------------------------------------------------------------------

function buildJsxAttributes(node: Z10Node, className: string, style: StyleMap): string {
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

  // Add data attributes (except z10 internal ones)
  for (const [key, value] of Object.entries(node.attributes)) {
    if (key.startsWith('data-z10-')) continue;
    attrs.push(`${key}="${escapeJsx(value)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

// ---------------------------------------------------------------------------
// Template → JSX Conversion
// ---------------------------------------------------------------------------

function templateToJsx(template: string, schema: ComponentSchema): string {
  let jsx = template.trim();

  // Convert class= to className=
  jsx = jsx.replace(/\bclass="/g, 'className="');

  // Convert style strings to style objects
  jsx = jsx.replace(/\bstyle="([^"]*)"/g, (_match, styleStr: string) => {
    const styleMap = parseInlineStyleForJsx(styleStr);
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

function parseInlineStyleForJsx(style: string): Record<string, string> {
  const result: Record<string, string> = {};
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

// ---------------------------------------------------------------------------
// Tokens CSS Generation
// ---------------------------------------------------------------------------

function generateTokensCss(doc: Z10Document): string {
  const lines: string[] = [];
  lines.push(':root {');

  for (const token of doc.tokens.primitives.values()) {
    lines.push(`  ${token.name}: ${token.value};`);
  }
  for (const token of doc.tokens.semantic.values()) {
    lines.push(`  ${token.name}: ${token.value};`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function mapHtmlTag(tag: string): string {
  // Keep semantic HTML tags as-is
  return tag;
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
