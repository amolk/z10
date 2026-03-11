/**
 * Export Z10 documents to Vue 3 Single File Components (SFC).
 *
 * Converts Z10 nodes into Vue 3 components using Composition API
 * with <script setup> syntax. Reuses the Tailwind CSS mapping
 * from the React export.
 *
 * PRD Phase 4: Additional export targets (Vue, Svelte)
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

export interface ExportVueOptions {
  /** Node ID to export (omit for full document) */
  id?: NodeId;
  /** Include design tokens as CSS variables (default: true) */
  includeTokens?: boolean;
  /** Use TypeScript in <script setup> (default: true) */
  typescript?: boolean;
}

export interface ExportVueResult {
  /** The generated Vue SFC code */
  code: string;
  /** Component names that were exported */
  components: string[];
  /** Tokens CSS if includeTokens is true */
  tokensCss?: string;
}

/** Export a Z10 document (or subtree) to Vue 3 SFC code */
export function exportVue(doc: Z10Document, options: ExportVueOptions = {}): ExportVueResult {
  const { id, includeTokens = true, typescript = true } = options;
  const components: string[] = [];
  const parts: string[] = [];

  // Export component definitions first
  for (const schema of doc.components.values()) {
    parts.push(generateComponentSfc(schema, typescript));
    parts.push('');
    components.push(schema.name);
  }

  // Export pages or a specific subtree
  if (id) {
    const node = getNode(doc, id);
    if (!node) {
      return { code: `<!-- Error: Node not found: ${id} -->`, components: [] };
    }
    const pageName = toPascalCase(node.id);
    parts.push(generatePageSfc(doc, node, pageName, typescript, components));
    components.push(pageName);
  } else {
    for (const page of doc.pages) {
      const root = doc.nodes.get(page.rootNodeId);
      if (!root) continue;
      const pageName = toPascalCase(page.name);
      parts.push(generatePageSfc(doc, root, pageName, typescript, components));
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
// Component SFC Generator
// ---------------------------------------------------------------------------

function generateComponentSfc(schema: ComponentSchema, typescript: boolean): string {
  const lines: string[] = [];

  // <script setup>
  const lang = typescript ? ' lang="ts"' : '';
  lines.push(`<script setup${lang}>`);

  if (schema.props.length > 0) {
    if (typescript) {
      // Use defineProps with TypeScript interface
      lines.push('');
      lines.push(`interface ${schema.name}Props {`);
      for (const prop of schema.props) {
        const optional = prop.required ? '' : '?';
        const tsType = propTypeToTs(prop.type, prop.options);
        lines.push(`  ${prop.name}${optional}: ${tsType};`);
      }
      lines.push('}');
      lines.push('');

      // Build withDefaults if any props have defaults
      const propsWithDefaults = schema.props.filter(p => p.default !== undefined);
      if (propsWithDefaults.length > 0) {
        lines.push(`const props = withDefaults(defineProps<${schema.name}Props>(), {`);
        for (const prop of propsWithDefaults) {
          lines.push(`  ${prop.name}: ${JSON.stringify(prop.default)},`);
        }
        lines.push('});');
      } else {
        lines.push(`const props = defineProps<${schema.name}Props>();`);
      }
    } else {
      // JavaScript defineProps
      lines.push('');
      lines.push('const props = defineProps({');
      for (const prop of schema.props) {
        const type = propTypeToVueType(prop.type);
        const parts: string[] = [`type: ${type}`];
        if (prop.required) parts.push('required: true');
        if (prop.default !== undefined) parts.push(`default: ${JSON.stringify(prop.default)}`);
        lines.push(`  ${prop.name}: { ${parts.join(', ')} },`);
      }
      lines.push('});');
    }
  }

  lines.push('</script>');
  lines.push('');

  // <template>
  lines.push('<template>');
  if (schema.template) {
    const tmpl = templateToVue(schema.template, schema);
    lines.push(`  ${tmpl}`);
  } else {
    lines.push(`  <div class="${toKebabCase(schema.name)}"><!-- ${schema.name} --></div>`);
  }
  lines.push('</template>');

  // <style scoped> if component has styles
  if (schema.styles) {
    lines.push('');
    lines.push('<style scoped>');
    lines.push(schema.styles);
    lines.push('</style>');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Page SFC Generator
// ---------------------------------------------------------------------------

function generatePageSfc(
  doc: Z10Document,
  root: Z10Node,
  name: string,
  typescript: boolean,
  componentNames: string[],
): string {
  const lines: string[] = [];
  const lang = typescript ? ' lang="ts"' : '';

  // Collect component imports needed
  const usedComponents = collectUsedComponents(doc, root);

  // <script setup>
  if (usedComponents.size > 0) {
    lines.push(`<script setup${lang}>`);
    for (const compName of usedComponents) {
      lines.push(`import ${compName} from './${compName}.vue';`);
    }
    lines.push('</script>');
    lines.push('');
  }

  // <template>
  lines.push('<template>');
  lines.push(renderNode(doc, root, 1));
  lines.push('</template>');

  return lines.join('\n');
}

function collectUsedComponents(doc: Z10Document, node: Z10Node): Set<string> {
  const result = new Set<string>();
  if (node.componentName) {
    result.add(node.componentName);
  }
  for (const child of getChildren(doc, node.id)) {
    for (const name of collectUsedComponents(doc, child)) {
      result.add(name);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Node Tree → Vue Template
// ---------------------------------------------------------------------------

function renderNode(doc: Z10Document, node: Z10Node, indent: number): string {
  const pad = '  '.repeat(indent);
  const children = getChildren(doc, node.id);

  // If this is a component instance, render as component
  if (node.componentName) {
    return renderComponentInstance(node, indent);
  }

  // Build class and style attributes
  const { className, style } = stylesToTailwind(node.styles);
  const attrs = buildVueAttributes(node, className, style);

  if (children.length === 0 && !node.textContent) {
    return `${pad}<${node.tag}${attrs} />`;
  }

  const parts: string[] = [];
  parts.push(`${pad}<${node.tag}${attrs}>`);

  if (node.textContent) {
    parts.push(`${pad}  ${escapeHtml(node.textContent)}`);
  }

  for (const child of children) {
    parts.push(renderNode(doc, child, indent + 1));
  }

  parts.push(`${pad}</${node.tag}>`);
  return parts.join('\n');
}

function renderComponentInstance(node: Z10Node, indent: number): string {
  const pad = '  '.repeat(indent);
  const componentName = node.componentName!;
  const props = node.componentProps ?? {};

  const propEntries = Object.entries(props);
  if (propEntries.length === 0) {
    return `${pad}<${componentName} />`;
  }

  const propsStr = propEntries
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}="${escapeHtml(value)}"`;
      return `:${key}="${JSON.stringify(value)}"`;
    })
    .join(' ');

  return `${pad}<${componentName} ${propsStr} />`;
}

// ---------------------------------------------------------------------------
// CSS → Tailwind Conversion (shared logic with React export)
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
// Vue Attribute Building
// ---------------------------------------------------------------------------

function buildVueAttributes(node: Z10Node, className: string, style: StyleMap): string {
  const attrs: string[] = [];

  if (className) {
    attrs.push(`class="${className}"`);
  }

  const styleEntries = Object.entries(style);
  if (styleEntries.length > 0) {
    const styleStr = styleEntries
      .map(([prop, value]) => `${prop}: ${value}`)
      .join('; ');
    attrs.push(`:style="{ ${styleEntries.map(([p, v]) => `'${p}': '${v}'`).join(', ')} }"`);
  }

  // Add data attributes (except z10 internal ones)
  for (const [key, value] of Object.entries(node.attributes)) {
    if (key.startsWith('data-z10-')) continue;
    attrs.push(`${key}="${escapeHtml(value)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

// ---------------------------------------------------------------------------
// Template → Vue Conversion
// ---------------------------------------------------------------------------

function templateToVue(template: string, schema: ComponentSchema): string {
  let tmpl = template.trim();

  // Convert template variables {{propName}} to Vue interpolation {{ propName }}
  // (Vue already uses {{ }}, but ensure proper spacing)
  tmpl = tmpl.replace(/\{\{(\w+)\}\}/g, '{{ $1 }}');

  return tmpl;
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
    case 'slot': return 'unknown';
    default: return 'unknown';
  }
}

function propTypeToVueType(type: string): string {
  switch (type) {
    case 'string': return 'String';
    case 'number': return 'Number';
    case 'boolean': return 'Boolean';
    case 'enum': return 'String';
    case 'slot': return 'Object';
    default: return 'String';
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
