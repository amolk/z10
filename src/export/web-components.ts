/**
 * Web Components export.
 *
 * Extracts component definitions from a .z10.html document into standalone files.
 * Since the source IS already Web Components, export is mostly extraction + packaging.
 */

import type { ComponentSchema } from '../core/types.js';
import { toTagName, toClassName } from '../core/types.js';

export interface ExportWebComponentsOptions {
  /** Specific component name to export (omit for all) */
  name?: string;
  /** Include design tokens as CSS custom properties */
  includeTokens?: boolean;
  /** Token maps for CSS generation */
  tokens?: {
    primitives?: Map<string, { name: string; value: string }>;
    semantic?: Map<string, { name: string; value: string }>;
  };
}

export interface ExportWebComponentsResult {
  /** The generated standalone JS module */
  code: string;
  /** Component names that were exported */
  components: string[];
  /** Tokens CSS if includeTokens is true */
  tokensCss?: string;
}

/**
 * Export Web Component definitions as standalone JS modules.
 * Combines template + style + class body into a self-contained module.
 */
export function exportWebComponents(
  schemas: ComponentSchema[],
  options: ExportWebComponentsOptions = {},
): ExportWebComponentsResult {
  const { name, includeTokens, tokens } = options;
  const components: string[] = [];
  const parts: string[] = [];

  parts.push('// Generated Web Components — standalone module');
  parts.push('// Usage: <script type="module" src="./components.js"></script>');
  parts.push('');

  const toExport = name ? schemas.filter(s => s.name === name) : schemas;

  for (const schema of toExport) {
    parts.push(generateStandaloneComponent(schema));
    parts.push('');
    components.push(schema.name);
  }

  let tokensCss: string | undefined;
  if (includeTokens && tokens) {
    tokensCss = generateTokensCss(tokens);
  }

  return {
    code: parts.join('\n'),
    components,
    tokensCss,
  };
}

/** Generate the template setup lines shared by both classBody and generated branches. */
function generateTemplateSetup(schema: ComponentSchema, tagName: string): string[] {
  const templateId = `${tagName}-template`;
  const lines: string[] = [];
  lines.push(`  const template = document.createElement('template');`);
  lines.push(`  template.id = '${templateId}';`);
  const templateContent: string[] = [];
  if (schema.styles) {
    templateContent.push(`<style>${schema.styles}</style>`);
  }
  if (schema.template) {
    templateContent.push(schema.template);
  }
  lines.push(`  template.innerHTML = ${JSON.stringify(templateContent.join('\n'))};`);
  lines.push(`  document.head.appendChild(template);`);
  return lines;
}

function generateStandaloneComponent(schema: ComponentSchema): string {
  const tagName = schema.tagName || toTagName(schema.name);
  const className = toClassName(schema.name);
  const templateId = `${tagName}-template`;

  const lines: string[] = [];
  lines.push(`// ${schema.name} (${tagName})`);
  lines.push('{');
  lines.push(...generateTemplateSetup(schema, tagName));
  lines.push('');

  if (schema.classBody) {
    lines.push(`  ${schema.classBody}`);
  } else {
    const propNames = schema.props.map(p => p.name);
    lines.push(`  class ${className} extends HTMLElement {`);
    lines.push(`    static observedAttributes = [${propNames.map(n => `'${n}'`).join(', ')}];`);
    lines.push(`    constructor() {`);
    lines.push(`      super();`);
    lines.push(`      const shadow = this.attachShadow({ mode: 'open' });`);
    lines.push(`      const t = document.getElementById('${templateId}');`);
    lines.push(`      if (t) shadow.appendChild(t.content.cloneNode(true));`);
    lines.push(`    }`);
    lines.push(`    connectedCallback() { this.render(); }`);
    lines.push(`    attributeChangedCallback() { this.render(); }`);
    lines.push(`    render() {`);
    for (const prop of schema.props) {
      if (prop.type === 'boolean') {
        lines.push(`      const ${prop.name} = this.hasAttribute('${prop.name}');`);
      } else {
        const def = prop.default !== undefined ? JSON.stringify(String(prop.default)) : "''";
        lines.push(`      const ${prop.name} = this.getAttribute('${prop.name}') || ${def};`);
      }
    }
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  customElements.define('${tagName}', ${className});`);
  }

  lines.push('}');
  return lines.join('\n');
}

function generateTokensCss(tokens: NonNullable<ExportWebComponentsOptions['tokens']>): string {
  const lines: string[] = [':root {'];
  if (tokens.primitives) {
    for (const token of tokens.primitives.values()) {
      const prop = token.name.startsWith('--') ? token.name : `--${token.name}`;
      lines.push(`  ${prop}: ${token.value};`);
    }
  }
  if (tokens.semantic) {
    for (const token of tokens.semantic.values()) {
      const prop = token.name.startsWith('--') ? token.name : `--${token.name}`;
      lines.push(`  ${prop}: ${token.value};`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}
