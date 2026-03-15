/**
 * Parser for the .z10.html file format.
 *
 * Converts a .z10.html string into a Z10Document in-memory model.
 * Uses simple regex/string-based parsing since the format is well-structured
 * and we only need to extract z10-specific metadata + node tree.
 *
 * File structure (PRD Section 4.4):
 *   <html data-z10-project="...">
 *   <head>
 *     <script type="application/z10+json" data-z10-role="config"> JSON </script>
 *     <style data-z10-tokens="primitives"> CSS </style>
 *     <style data-z10-tokens="semantic"> CSS </style>
 *     <script type="application/z10+json" data-z10-role="component"> JSON </script>
 *     <style data-z10-component-styles="Name"> CSS </style>
 *     <template data-z10-template="Name"> HTML </template>
 *   </head>
 *   <body>
 *     <div data-z10-page="PageName" data-z10-mode="light|dark"> ... </div>
 *   </body>
 *   </html>
 */

import type {
  Z10Document,
  Z10Node,
  Z10Page,
  ProjectConfig,
  TokenSet,
  ComponentSchema,
  ComponentProp,
  ComponentVariant,
  DesignToken,
  TokenCollection,
  NodeId,
  NodeIntent,
  NodeEditor,
  StyleMap,
  DisplayMode,
  GovernanceLevel,
} from '../core/types.js';
import { createDocument, createNode, addNode, addPage, parseInlineStyle } from '../core/document.js';
import { toTagName, tagNameToComponentName } from '../core/types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Parse a .z10.html string into a Z10Document */
export function parseZ10Html(html: string): Z10Document {
  const config = extractConfig(html);
  const doc = createDocument(config);

  // Extract token blocks
  extractTokens(html, doc);

  // Extract component definitions
  extractComponents(html, doc);

  // Extract page nodes from <body>
  extractPages(html, doc);

  return doc;
}

// ---------------------------------------------------------------------------
// Config Extraction
// ---------------------------------------------------------------------------

function extractConfig(html: string): Partial<ProjectConfig> {
  const match = html.match(
    /<script\s+type="application\/z10\+json"\s+data-z10-role="config"\s*>([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) return {};

  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
    return {
      name: typeof raw['name'] === 'string' ? raw['name'] : undefined,
      version: typeof raw['version'] === 'string' ? raw['version'] : undefined,
      governance: isGovernanceLevel(raw['governance']) ? raw['governance'] : undefined,
      defaultMode: isDisplayMode(raw['defaultMode']) ? raw['defaultMode'] : undefined,
    };
  } catch {
    return {};
  }
}

function isGovernanceLevel(v: unknown): v is GovernanceLevel {
  return v === 'full-edit' || v === 'propose-approve' || v === 'scoped-edit';
}

function isDisplayMode(v: unknown): v is DisplayMode {
  return v === 'light' || v === 'dark';
}

// ---------------------------------------------------------------------------
// Token Extraction
// ---------------------------------------------------------------------------

function extractTokens(html: string, doc: Z10Document): void {
  const tokenBlockRe = /<style\s+data-z10-tokens="(primitives|semantic)"\s*>([\s\S]*?)<\/style>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenBlockRe.exec(html)) !== null) {
    const collection = match[1] as TokenCollection;
    const css = match[2] ?? '';
    parseTokenCss(css, collection, doc);
  }
}

/** Parse CSS custom property declarations from a token style block */
function parseTokenCss(css: string, collection: TokenCollection, doc: Z10Document): void {
  // Match custom property declarations: --name: value;
  const propRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = propRe.exec(css)) !== null) {
    const name = match[1]!;
    const value = match[2]!.trim();
    const token: DesignToken = { name, value, collection };
    doc.tokens[collection].set(name, token);
  }
}

// ---------------------------------------------------------------------------
// Component Extraction
// ---------------------------------------------------------------------------

function extractComponents(html: string, doc: Z10Document): void {
  // --- NEW format extraction (takes priority) ---

  // Index new-format metadata blocks: <script type="application/z10+json" data-z10-role="component-meta" data-z10-component="Name">
  const metaIndex = new Map<string, Record<string, unknown>>();
  const metaRe = /<script\s+type="application\/z10\+json"\s+data-z10-role="component-meta"\s+data-z10-component="([^"]*)"\s*>([\s\S]*?)<\/script>/g;
  let mm: RegExpExecArray | null;
  while ((mm = metaRe.exec(html)) !== null) {
    try {
      metaIndex.set(mm[1]!, JSON.parse(mm[2]!.trim()) as Record<string, unknown>);
    } catch {
      // Skip malformed metadata blocks
    }
  }

  // Index new-format templates: <template id="z10-name-template">
  const newTemplateIndex = new Map<string, { template: string; styles: string }>();
  const newTemplateRe = /<template\s+id="z10-([a-z0-9-]+)-template"\s*>([\s\S]*?)<\/template>/g;
  let nt: RegExpExecArray | null;
  while ((nt = newTemplateRe.exec(html)) !== null) {
    const slug = nt[1]!;
    const fullContent = nt[2]!;
    // Extract <style> from inside the template
    const styleMatch = fullContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    const styles = styleMatch ? styleMatch[1]!.trim() : '';
    // Template HTML is the content minus the <style> block
    const template = fullContent.replace(/<style[^>]*>[\s\S]*?<\/style>/, '').trim();
    newTemplateIndex.set(slug, { template, styles });
  }

  // Index new-format class bodies: <script type="module" data-z10-component="Name">
  const classBodyIndex = new Map<string, string>();
  const classBodyRe = /<script\s+type="module"\s+data-z10-component="([^"]*)"\s*>([\s\S]*?)<\/script>/g;
  let cb: RegExpExecArray | null;
  while ((cb = classBodyRe.exec(html)) !== null) {
    classBodyIndex.set(cb[1]!, cb[2]!.trim());
  }

  // Build ComponentSchema for each new-format component
  for (const [name, meta] of metaIndex) {
    const tagName = toTagName(name);
    // Derive slug from tagName: strip "z10-" prefix
    const slug = tagName.slice(4);
    const tmpl = newTemplateIndex.get(slug);

    const schema: ComponentSchema = {
      name,
      tagName,
      category: typeof meta['category'] === 'string' ? meta['category'] : undefined,
      description: typeof meta['description'] === 'string' ? meta['description'] : undefined,
      props: parseComponentProps(meta['props']),
      variants: parseComponentVariants(meta['variants']),
      slots: Array.isArray(meta['slots']) ? meta['slots'] as string[] : undefined,
      classBody: classBodyIndex.get(name) ?? '',
      template: tmpl?.template ?? '',
      styles: tmpl?.styles ?? '',
    };

    doc.components.set(name, schema);
  }

  // --- OLD format extraction (skips components already found in new format) ---

  // Pre-index all component styles and templates in a single pass
  const stylesIndex = new Map<string, string>();
  const templateIndex = new Map<string, string>();

  const stylesRe = /<style\s+data-z10-component-styles="([^"]*)"\s*>([\s\S]*?)<\/style>/g;
  let sm: RegExpExecArray | null;
  while ((sm = stylesRe.exec(html)) !== null) {
    stylesIndex.set(sm[1]!, sm[2]!.trim());
  }

  const templateRe = /<template\s+data-z10-template="([^"]*)"\s*>([\s\S]*?)<\/template>/g;
  let tm: RegExpExecArray | null;
  while ((tm = templateRe.exec(html)) !== null) {
    templateIndex.set(tm[1]!, tm[2]!.trim());
  }

  // Extract component JSON blocks and look up styles/templates from index
  const componentRe =
    /<script\s+type="application\/z10\+json"\s+data-z10-role="component"\s*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = componentRe.exec(html)) !== null) {
    try {
      const raw = JSON.parse(match[1]!.trim()) as Record<string, unknown>;
      const name = typeof raw['name'] === 'string' ? raw['name'] : '';
      if (!name) continue;

      // Skip if already extracted via new format
      if (doc.components.has(name)) continue;

      const schema: ComponentSchema = {
        name,
        tagName: toTagName(name),
        description: typeof raw['description'] === 'string' ? raw['description'] : undefined,
        props: parseComponentProps(raw['props']),
        variants: parseComponentVariants(raw['variants']),
        slots: Array.isArray(raw['slots']) ? raw['slots'] as string[] : undefined,
        styles: stylesIndex.get(name) ?? '',
        template: templateIndex.get(name) ?? '',
        classBody: '',
      };

      doc.components.set(name, schema);
    } catch {
      // Skip malformed component blocks
    }
  }
}

function parseComponentProps(raw: unknown): ComponentProp[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isComponentProp);
}

function isComponentProp(v: unknown): v is ComponentProp {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj['name'] === 'string' && typeof obj['type'] === 'string';
}

function parseComponentVariants(raw: unknown): ComponentVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isComponentVariant);
}

function isComponentVariant(v: unknown): v is ComponentVariant {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj['name'] === 'string' && typeof obj['props'] === 'object';
}

// ---------------------------------------------------------------------------
// Page & Node Tree Extraction
// ---------------------------------------------------------------------------

function extractPages(html: string, doc: Z10Document): void {
  // Find all page containers in <body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  if (!bodyMatch?.[1]) return;

  const bodyContent = bodyMatch[1];

  // Find page divs
  const pageRe = /<div\s+([^>]*data-z10-page="([^"]*)"[^>]*)>([\s\S]*?)<\/div>\s*(?=<div\s+[^>]*data-z10-page=|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pageRe.exec(bodyContent)) !== null) {
    const attrs = match[1] ?? '';
    const pageName = match[2] ?? '';
    const content = match[3] ?? '';

    const mode = extractAttrValue(attrs, 'data-z10-mode') as DisplayMode ?? 'light';
    const rootId = extractAttrValue(attrs, 'data-z10-id') ?? `page_${pageName}`;

    // Create root node for this page
    const rootNode = createNode({
      id: rootId,
      tag: 'div',
      parent: null,
      intent: 'layout',
      attributes: extractDataAttributes(attrs),
    });
    addNode(doc, rootNode);

    // Parse child nodes recursively
    parseChildNodes(content, rootId, doc);

    addPage(doc, { name: pageName, rootNodeId: rootId, mode });
  }
}

/** Recursively parse HTML nodes into Z10 nodes */
function parseChildNodes(html: string, parentId: NodeId, doc: Z10Document): void {
  const tagRe = /<([\w-]+)\s*([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[1]!;
    const attrStr = match[2] ?? '';
    const innerHtml = match[3] ?? '';

    const id = extractAttrValue(attrStr, 'data-z10-id') ??
               `${parentId}_${tag}_${match.index}`;

    const intent = (extractAttrValue(attrStr, 'data-z10-intent') ?? 'content') as NodeIntent;
    const editor = (extractAttrValue(attrStr, 'data-z10-editor') ?? 'designer') as NodeEditor;
    const agentEditable = extractAttrValue(attrStr, 'data-z10-agent-editable') !== 'false';
    const style = extractAttrValue(attrStr, 'style') ?? '';
    const textContent = getTextContent(innerHtml);

    // Detect custom element tags (z10-* with hyphen)
    const isCustomElement = tag.startsWith('z10-') && tag.includes('-');
    const componentName = isCustomElement
      ? (tagNameToComponentName(tag) ?? undefined)
      : extractAttrValue(attrStr, 'data-z10-component');

    // Parse custom element-specific attributes
    let componentOverrides: Record<string, string | number | boolean> | undefined;
    let componentVariant: string | undefined;
    let componentDef: string | undefined;
    let componentProps: Record<string, string | number | boolean> | undefined;

    if (isCustomElement) {
      const overridesStr = extractAttrValue(attrStr, 'data-z10-overrides');
      if (overridesStr) {
        try { componentOverrides = JSON.parse(overridesStr); } catch { /* skip */ }
      }
      componentVariant = extractAttrValue(attrStr, 'data-z10-variant') ?? undefined;
      componentDef = extractAttrValue(attrStr, 'data-z10-component-def') ?? undefined;

      // Collect regular HTML attributes (not data-z10-*, not style) as component props
      componentProps = extractNonZ10Attributes(attrStr);
    }

    const node = createNode({
      id,
      tag,
      parent: parentId,
      style,
      intent,
      editor,
      agentEditable,
      textContent: textContent || undefined,
      componentName: componentName || undefined,
      componentProps,
      componentDef,
      componentOverrides,
      componentVariant,
      attributes: extractDataAttributes(attrStr),
    });

    addNode(doc, node);

    // Recurse into children (skip if this is a text-only node)
    if (hasChildElements(innerHtml)) {
      parseChildNodes(innerHtml, id, doc);
    }
  }
}

// ---------------------------------------------------------------------------
// HTML Attribute Helpers
// ---------------------------------------------------------------------------

/** Cache compiled RegExp objects per attribute name to avoid re-creation on every call */
const _attrRegexCache = new Map<string, RegExp>();

function extractAttrValue(attrStr: string, name: string): string | undefined {
  let re = _attrRegexCache.get(name);
  if (!re) {
    re = new RegExp(`${escapeRegex(name)}="([^"]*)"`, 'i');
    _attrRegexCache.set(name, re);
  }
  const match = attrStr.match(re);
  return match?.[1];
}

function extractDataAttributes(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /(data-z10-[\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrStr)) !== null) {
    result[match[1]!] = match[2]!;
  }
  return result;
}

/** Extract regular HTML attributes (not data-z10-*, not style, not class) as component props.
 *  Handles both key="value" pairs and bare boolean attributes (e.g. `active`). */
function extractNonZ10Attributes(attrStr: string): Record<string, string | number | boolean> | undefined {
  const result: Record<string, string | number | boolean> = {};
  // Match key="value" pairs
  const kvRe = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  let found = false;
  const seenKeys = new Set<string>();
  while ((match = kvRe.exec(attrStr)) !== null) {
    const key = match[1]!;
    seenKeys.add(key);
    if (key.startsWith('data-z10-') || key === 'style' || key === 'class') continue;
    found = true;
    const val = match[2]!;
    if (val === 'true') result[key] = true;
    else if (val === 'false') result[key] = false;
    else if (val !== '' && !isNaN(Number(val))) result[key] = Number(val);
    else result[key] = val;
  }
  // Match bare boolean attributes (word not followed by =)
  const bareRe = /(?:^|\s)([\w-]+)(?=\s|$)/g;
  while ((match = bareRe.exec(attrStr)) !== null) {
    const key = match[1]!;
    if (seenKeys.has(key)) continue; // already handled as key="value"
    if (key.startsWith('data-z10-') || key === 'style' || key === 'class') continue;
    found = true;
    result[key] = true;
  }
  return found ? result : undefined;
}

function getTextContent(html: string): string {
  // Fast path: if no tags present, skip regex
  if (!html.includes('<')) return html.trim();
  // Strip all HTML tags to get plain text
  return html.replace(/<[^>]+>/g, '').trim();
}

function hasChildElements(html: string): boolean {
  return /<[\w][\w-]*[\s>]/.test(html);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
