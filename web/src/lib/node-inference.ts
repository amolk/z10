/**
 * Infer element types from native HTML semantics — tag name, CSS, children.
 * Replaces the old `data-z10-node` attribute approach.
 */

const STRUCTURAL_TAGS = new Set([
  "DIV", "SECTION", "ARTICLE", "ASIDE", "MAIN", "NAV",
  "HEADER", "FOOTER", "FORM", "UL", "OL", "FIGURE",
  "FIELDSET", "TABLE",
]);

const TEXT_TAGS = new Set([
  "P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6",
  "A", "LABEL", "BLOCKQUOTE", "CODE", "PRE", "LI",
]);

const FLEX_GRID_RE = /\b(flex|grid|inline-flex|inline-grid)\b/;

function isCustomElement(el: HTMLElement): boolean {
  return el.tagName.includes("-");
}

export function isZ10Component(el: HTMLElement): boolean {
  return el.tagName.startsWith("Z10-") && el.tagName.includes("-");
}

export function isComponentDefinition(el: HTMLElement): boolean {
  return el.hasAttribute("data-z10-component-def");
}

function hasFlexGridDisplay(el: HTMLElement): boolean {
  const style = el.style;
  if (style.display && FLEX_GRID_RE.test(style.display)) return true;
  if (el.className && typeof el.className === "string" && FLEX_GRID_RE.test(el.className)) return true;
  return false;
}

/**
 * Infer the node type of an element from its HTML semantics.
 *
 * Priority:
 * 1. Container/Frame — flex/grid display, structural tags, has children, custom elements
 * 2. Text — text-semantic tags, or leaf with text content
 * 3. Fallback — "element"
 */
export function inferNodeType(el: HTMLElement): "frame" | "text" | "element" {
  // Component definition — always a frame
  if (isComponentDefinition(el)) return "frame";

  // Container detection
  if (hasFlexGridDisplay(el)) return "frame";
  if (STRUCTURAL_TAGS.has(el.tagName) && el.children.length > 0) return "frame";
  if (el.children.length > 0) return "frame";
  if (isCustomElement(el)) return "frame";

  // Structural tags with no children — still frame if they're layout containers
  if (STRUCTURAL_TAGS.has(el.tagName) && hasFlexGridDisplay(el)) return "frame";

  // Text detection
  if (TEXT_TAGS.has(el.tagName)) return "text";
  if (el.querySelector("[data-z10-id]") === null && el.textContent?.trim()) return "text";

  return "element";
}

/**
 * Returns true for frame-type elements. Used for drop target detection.
 */
export function isContainer(el: HTMLElement): boolean {
  return inferNodeType(el) === "frame";
}

/**
 * Returns true when element should enter inline text editing on double-click/Enter.
 */
export function isTextEditable(el: HTMLElement): boolean {
  if (TEXT_TAGS.has(el.tagName)) return true;
  const hasChildZ10 = el.querySelector("[data-z10-id]") !== null;
  if (!hasChildZ10 && el.textContent?.trim()) return true;
  return false;
}
