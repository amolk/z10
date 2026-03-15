/**
 * Web Components class body generation from ComponentSchema.
 * Generates the JavaScript class and registration script for custom elements.
 */

import type { ComponentSchema } from '../core/types.js';
import { toTagName, toClassName } from '../core/types.js';

/**
 * Generate the JS class body string for a custom element from a component schema.
 * Includes the class definition and customElements.define() call.
 */
export function generateClassBody(schema: ComponentSchema): string {
  const className = toClassName(schema.name);
  const tagName = schema.tagName || toTagName(schema.name);
  const templateId = `${tagName}-template`;
  const propNames = schema.props.map(p => p.name);

  const lines: string[] = [];

  lines.push(`class ${className} extends HTMLElement {`);
  lines.push(`  static observedAttributes = [${propNames.map(n => `'${n}'`).join(', ')}];`);
  lines.push('');
  lines.push('  constructor() {');
  lines.push('    super();');
  lines.push(`    const shadow = this.attachShadow({ mode: 'open' });`);
  lines.push(`    const template = document.getElementById('${templateId}');`);
  lines.push(`    if (template) shadow.appendChild(template.content.cloneNode(true));`);
  lines.push('  }');
  lines.push('');
  lines.push('  connectedCallback() { this.render(); }');
  lines.push('  attributeChangedCallback() { this.render(); }');
  lines.push('');
  lines.push('  render() {');

  // Generate attribute reads
  for (const prop of schema.props) {
    if (prop.type === 'boolean') {
      lines.push(`    const ${prop.name} = this.hasAttribute('${prop.name}');`);
    } else {
      const defaultVal = prop.default !== undefined ? JSON.stringify(String(prop.default)) : "''";
      lines.push(`    const ${prop.name} = this.getAttribute('${prop.name}') || ${defaultVal};`);
    }
  }

  // Generate DOM updates based on template content
  // Simple approach: update text content of elements matching .{propName} class
  // and handle common patterns
  if (schema.template) {
    lines.push('    const root = this.shadowRoot;');
    lines.push('    if (!root) return;');

    for (const prop of schema.props) {
      if (prop.type === 'boolean') {
        // Boolean props toggle attributes on shadow root elements
        lines.push(`    // Boolean prop: ${prop.name}`);
      } else {
        // String/number props update text content of matching elements
        lines.push(`    const ${prop.name}El = root.querySelector('.${prop.name}');`);
        lines.push(`    if (${prop.name}El) ${prop.name}El.textContent = ${prop.name};`);
      }
    }
  }

  lines.push('  }');
  lines.push('}');
  lines.push(`customElements.define('${tagName}', ${className});`);

  return lines.join('\n');
}

