/**
 * Export DOM trees to Svelte components.
 *
 * E6: Migrated from Z10Document/Z10Node to DOM Element input.
 * Converts DOM elements into Svelte components with Tailwind CSS
 * utility classes and TypeScript support.
 */

import type { ComponentSchema, StyleMap } from '../core/types.js';
import { stripForExport } from '../dom/strip.js';
import type { ExportContext } from './react.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExportSvelteOptions {
  /** CSS selector for subtree root (omit for full element) */
  selector?: string;
  /** Include design tokens as CSS variables (default: true) */
  includeTokens?: boolean;
  /** Use TypeScript (default: true) */
  typescript?: boolean;
  /** Component schemas and token context */
  context?: ExportContext;
}

export interface ExportSvelteResult {
  /** The generated Svelte component code */
  code: string;
  /** Component names that were exported */
  components: string[];
  /** Tokens CSS if includeTokens is true */
  tokensCss?: string;
}

/** Export a DOM element (or subtree) to Svelte component code */
export function exportSvelte(root: Element, options: ExportSvelteOptions = {}): ExportSvelteResult {
  const { selector, includeTokens = true, typescript = true, context = {} } = options;
  const components: string[] = [];
  const parts: string[] = [];

  // Export component definitions from context
  if (context.components) {
    for (const schema of context.components) {
      parts.push(generateComponentSvelte(schema, typescript));
      parts.push('');
      components.push(schema.name);
    }
  }

  // Export subtree or full element
  if (selector) {
    const target = root.querySelector(selector);
    if (!target) {
      return { code: `<!-- Error: Element not found: ${selector} -->`, components: [] };
    }
    const stripped = stripForExport(target);
    const name = elementToComponentName(target);
    parts.push(generatePageSvelte(stripped, name, typescript));
    components.push(name);
  } else {
    const pages = root.querySelectorAll('[data-z10-page]');
    if (pages.length > 0) {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as Element;
        const stripped = stripForExport(page);
        const pageName = toPascalCase(page.getAttribute('data-z10-page') || `Page${i + 1}`);
        parts.push(generatePageSvelte(stripped, pageName, typescript));
        parts.push('');
        components.push(pageName);
      }
    } else {
      const stripped = stripForExport(root);
      const name = elementToComponentName(root);
      parts.push(generatePageSvelte(stripped, name, typescript));
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
// Component Generator (from schemas)
// ---------------------------------------------------------------------------

function generateComponentSvelte(schema: ComponentSchema, typescript: boolean): string {
  const lines: string[] = [];
  const lang = typescript ? ' lang="ts"' : '';

  lines.push(`<script${lang}>`);

  if (schema.props.length > 0) {
    if (typescript) {
      lines.push('');
      for (const prop of schema.props) {
        const tsType = propTypeToTs(prop.type, prop.options);
        if (prop.default !== undefined) {
          lines.push(`  export let ${prop.name}: ${tsType} = ${JSON.stringify(prop.default)};`);
        } else {
          lines.push(`  export let ${prop.name}: ${tsType};`);
        }
      }
    } else {
      lines.push('');
      for (const prop of schema.props) {
        if (prop.default !== undefined) {
          lines.push(`  export let ${prop.name} = ${JSON.stringify(prop.default)};`);
        } else {
          lines.push(`  export let ${prop.name};`);
        }
      }
    }
  }

  lines.push('</script>');
  lines.push('');

  if (schema.template) {
    const tmpl = templateToSvelte(schema.template);
    lines.push(tmpl);
  } else {
    lines.push(`<div class="${toKebabCase(schema.name)}"><!-- ${schema.name} --></div>`);
  }

  if (schema.styles) {
    lines.push('');
    lines.push('<style>');
    lines.push(schema.styles);
    lines.push('</style>');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Page Generator
// ---------------------------------------------------------------------------

function generatePageSvelte(
  root: Element,
  _name: string,
  typescript: boolean,
): string {
  const lines: string[] = [];
  const lang = typescript ? ' lang="ts"' : '';

  const usedComponents = collectUsedComponents(root);

  if (usedComponents.size > 0) {
    lines.push(`<script${lang}>`);
    for (const compName of usedComponents) {
      lines.push(`  import ${compName} from './${compName}.svelte';`);
    }
    lines.push('</script>');
    lines.push('');
  }

  lines.push(renderElement(root, 0));

  return lines.join('\n');
}

function collectUsedComponents(el: Element): Set<string> {
  const result = new Set<string>();
  const componentName = el.getAttribute('data-z10-component');
  if (componentName) {
    result.add(componentName);
  }
  for (const child of Array.from(el.children)) {
    for (const name of collectUsedComponents(child)) {
      result.add(name);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// DOM Element → Svelte Template
// ---------------------------------------------------------------------------

function renderElement(el: Element, indent: number): string {
  const pad = '  '.repeat(indent);
  const children = Array.from(el.children);

  const componentName = el.getAttribute('data-z10-component');
  if (componentName) {
    return renderComponentInstance(el, componentName, indent);
  }

  const tag = el.tagName.toLowerCase();
  const styles = parseInlineStyle(el.getAttribute('style') || '');
  const { className, style } = stylesToTailwind(styles);
  const attrs = buildSvelteAttributes(el, className, style);

  const textContent = getDirectTextContent(el);

  if (children.length === 0 && !textContent) {
    return `${pad}<${tag}${attrs} />`;
  }

  const parts: string[] = [];
  parts.push(`${pad}<${tag}${attrs}>`);

  if (textContent) {
    parts.push(`${pad}  ${escapeHtml(textContent)}`);
  }

  for (const child of children) {
    parts.push(renderElement(child, indent + 1));
  }

  parts.push(`${pad}</${tag}>`);
  return parts.join('\n');
}

function renderComponentInstance(el: Element, componentName: string, indent: number): string {
  const pad = '  '.repeat(indent);

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
      if (typeof value === 'string') return `${key}="${escapeHtml(value)}"`;
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
  'padding': (v) => mapSpacingValue('p', v),
  'margin': (v) => mapSpacingValue('m', v),
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
    80: '20', 96: '24',
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
// Svelte Attribute Building
// ---------------------------------------------------------------------------

function buildSvelteAttributes(el: Element, className: string, style: StyleMap): string {
  const attrs: string[] = [];

  if (className) {
    attrs.push(`class="${className}"`);
  }

  const styleEntries = Object.entries(style);
  if (styleEntries.length > 0) {
    const styleStr = styleEntries
      .map(([prop, value]) => `${prop}: ${value}`)
      .join('; ');
    attrs.push(`style="${styleStr}"`);
  }

  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name.startsWith('data-z10-')) continue;
    if (attr.name === 'style') continue;
    if (attr.name === 'class') continue;
    attrs.push(`${attr.name}="${escapeHtml(attr.value)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function templateToSvelte(template: string): string {
  let tmpl = template.trim();
  tmpl = tmpl.replace(/\{\{(\w+)\}\}/g, '{$1}');
  return tmpl;
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

function getDirectTextContent(el: Element): string {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3) {
      text += child.textContent || '';
    }
  }
  return text.trim();
}

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
    case 'slot': return 'unknown';
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

function escapeHtml(str: string): string {
  return str.replace(/[<>&"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
