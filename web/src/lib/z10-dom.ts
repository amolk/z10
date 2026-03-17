/**
 * Bridge module: z10 DOM types and functions for the web app.
 *
 * Inlined from src/dom/ because Turbopack cannot resolve .js→.ts imports
 * in files outside the Next.js project. Keep in sync with the source.
 *
 * Source files: src/dom/patch-serialize.ts (types), src/dom/patch-replay.ts
 */

// ── Op types (from src/dom/patch-serialize.ts) ──

export interface AttrOp {
  op: "attr";
  id: string;
  name: string;
  value: string | null;
}

export interface StyleOp {
  op: "style";
  id: string;
  prop: string;
  value: string;
}

export interface TextOp {
  op: "text";
  id: string;
  value: string;
}

export interface AddOp {
  op: "add";
  parentId: string;
  html: string;
  before: string | null;
}

export interface RemoveOp {
  op: "remove";
  id: string;
}

export type PatchOp = AttrOp | StyleOp | TextOp | AddOp | RemoveOp;

export interface PatchEnvelope {
  txId: number;
  timestamp: number;
  ops: PatchOp[];
}

// ── Patch replay (from src/dom/patch-replay.ts) ──

/**
 * Replay a patch (array of ops) against a DOM tree rooted at rootElement.
 * Each op type is handled idempotently where possible.
 */
export function replayPatch(ops: PatchOp[], rootElement: Element): void {
  for (const op of ops) {
    switch (op.op) {
      case "attr":
        replayAttr(op, rootElement);
        break;
      case "style":
        replayStyle(op, rootElement);
        break;
      case "text":
        replayText(op, rootElement);
        break;
      case "add":
        replayAdd(op, rootElement);
        break;
      case "remove":
        replayRemove(op, rootElement);
        break;
    }
  }
}

function findNode(rootElement: Element, id: string): Element | null {
  return rootElement.querySelector(`[data-z10-id="${id}"]`);
}

function replayAttr(
  op: { id: string; name: string; value: string | null },
  rootElement: Element,
): void {
  const el = findNode(rootElement, op.id);
  if (!el) return;

  if (op.value === null) {
    el.removeAttribute(op.name);
  } else {
    el.setAttribute(op.name, op.value);
  }
}

function replayStyle(
  op: { id: string; prop: string; value: string },
  rootElement: Element,
): void {
  const el = findNode(rootElement, op.id) as HTMLElement | null;
  if (!el) return;

  if (el.style?.setProperty) {
    el.style.setProperty(op.prop, op.value);
  } else {
    const current = parseStyleAttr(el.getAttribute("style") || "");
    current.set(op.prop, op.value);
    el.setAttribute("style", serializeStyleMap(current));
  }
}

function replayText(
  op: { id: string; value: string },
  rootElement: Element,
): void {
  const el = findNode(rootElement, op.id);
  if (!el) return;
  el.textContent = op.value;
}

function replayAdd(
  op: { parentId: string; html: string; before: string | null },
  rootElement: Element,
): void {
  const parent = findNode(rootElement, op.parentId);
  if (!parent) return;

  const doc = rootElement.ownerDocument;
  const template = doc.createElement("template");
  template.innerHTML = op.html;
  const fragment = template.content || template;

  // Idempotency: remove any pre-existing elements with the same data-z10-id
  // to prevent doubling when the same patch is replayed or when a move
  // generates separate remove+add records that arrive out of order.
  const children = fragment.children || fragment.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Element;
    if (child.nodeType === 1) {
      const childId = child.getAttribute?.("data-z10-id");
      if (childId) {
        const existing = findNode(rootElement, childId);
        if (existing) {
          existing.parentElement?.removeChild(existing);
        }
      }
    }
  }

  if (op.before) {
    const beforeEl = findNode(rootElement, op.before);
    if (beforeEl && beforeEl.parentElement === parent) {
      while (fragment.firstChild) {
        parent.insertBefore(fragment.firstChild, beforeEl);
      }
    } else {
      while (fragment.firstChild) {
        parent.appendChild(fragment.firstChild);
      }
    }
  } else {
    while (fragment.firstChild) {
      parent.appendChild(fragment.firstChild);
    }
  }
}

function replayRemove(op: { id: string }, rootElement: Element): void {
  const el = findNode(rootElement, op.id);
  if (!el) return;
  el.parentElement?.removeChild(el);
}

// ── Style attribute helpers ──

function parseStyleAttr(str: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!str) return map;
  for (const decl of str.split(";")) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (prop && value) map.set(prop, value);
  }
  return map;
}

function serializeStyleMap(map: Map<string, string>): string {
  const parts: string[] = [];
  for (const [prop, value] of map) {
    parts.push(`${prop}: ${value}`);
  }
  return parts.join("; ");
}

// ── Component template expansion ──

interface ComponentTemplate {
  template: string;
  styles: string;
}

/**
 * Parse component templates and styles from the full .z10.html content.
 * Supports both new-format (component-meta + id="z10-name-template")
 * and old-format (data-z10-template="Name" + data-z10-component-styles="Name").
 */
export function parseComponentTemplates(
  fullContent: string,
): Map<string, ComponentTemplate> {
  const result = new Map<string, ComponentTemplate>();

  // --- New format templates: <template id="z10-name-template"> ---
  const newTemplateRe =
    /<template\s+id="z10-([a-z0-9-]+)-template"\s*>([\s\S]*?)<\/template>/g;
  let m: RegExpExecArray | null;
  while ((m = newTemplateRe.exec(fullContent)) !== null) {
    const slug = m[1]!;
    const fullTmpl = m[2]!;
    const styleMatch = fullTmpl.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    const styles = styleMatch ? styleMatch[1]!.trim() : "";
    const template = fullTmpl.replace(/<style[^>]*>[\s\S]*?<\/style>/, "").trim();
    // Derive component name from slug (e.g. "action-button" → "ActionButton")
    const name = slug
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("");
    result.set(name, { template, styles });
  }

  // --- New format metadata: extract name mapping ---
  const metaRe =
    /<script\s+type="application\/z10\+json"\s+data-z10-role="component-meta"\s+data-z10-component="([^"]*)"\s*>/g;
  while ((m = metaRe.exec(fullContent)) !== null) {
    const name = m[1]!;
    // If we already have this from new-format template, good. Otherwise mark it.
    if (!result.has(name)) {
      result.set(name, { template: "", styles: "" });
    }
  }

  // --- Old format templates: <template data-z10-template="Name"> ---
  const oldTemplateRe =
    /<template\s+data-z10-template="([^"]*)"\s*>([\s\S]*?)<\/template>/g;
  while ((m = oldTemplateRe.exec(fullContent)) !== null) {
    const name = m[1]!;
    if (result.has(name)) continue; // new format takes priority
    const template = m[2]!.trim();
    result.set(name, { template, styles: "" });
  }

  // --- Old format styles: <style data-z10-component-styles="Name"> ---
  const oldStylesRe =
    /<style\s+data-z10-component-styles="([^"]*)"\s*>([\s\S]*?)<\/style>/g;
  while ((m = oldStylesRe.exec(fullContent)) !== null) {
    const name = m[1]!;
    const existing = result.get(name);
    if (existing && !existing.styles) {
      existing.styles = m[2]!.trim();
    }
  }

  return result;
}

/**
 * Expand component templates into instance elements within a container.
 * Finds all elements with data-z10-component + data-z10-props, looks up
 * the matching template, substitutes {{propName}} placeholders, and sets
 * the instance's innerHTML. Also injects component styles.
 *
 * Marks expanded instances with data-z10-expanded="true" so we can
 * collapse them before serialization.
 */
export function expandComponentTemplates(
  containerEl: HTMLElement,
  templates: Map<string, ComponentTemplate>,
): void {
  if (templates.size === 0) return;

  // Inject component styles (if not already injected)
  const doc = containerEl.ownerDocument;
  if (!containerEl.querySelector("[data-z10-component-styles-injected]")) {
    const allStyles: string[] = [];
    for (const [, comp] of templates) {
      if (comp.styles) allStyles.push(comp.styles);
    }
    if (allStyles.length > 0) {
      const styleEl = doc.createElement("style");
      styleEl.setAttribute("data-z10-component-styles-injected", "true");
      styleEl.textContent = allStyles.join("\n");
      containerEl.prepend(styleEl);
    }
  }

  // Expand each component instance
  const instances = containerEl.querySelectorAll("[data-z10-component]");
  for (const instance of instances) {
    const el = instance as HTMLElement;
    // Skip already-expanded instances
    if (el.getAttribute("data-z10-expanded") === "true" && el.innerHTML.trim()) {
      continue;
    }

    const componentName = el.getAttribute("data-z10-component");
    if (!componentName) continue;

    const tmpl = templates.get(componentName);
    if (!tmpl?.template) continue;

    const propsStr = el.getAttribute("data-z10-props");
    let props: Record<string, unknown> = {};
    if (propsStr) {
      try {
        props = JSON.parse(propsStr);
      } catch {
        continue;
      }
    }

    // Expand template with prop substitution
    let expanded = tmpl.template;
    for (const [key, value] of Object.entries(props)) {
      expanded = expanded.replaceAll(`{{${key}}}`, String(value));
    }
    // Remove any remaining unresolved placeholders
    expanded = expanded.replace(/\{\{[^}]+\}\}/g, "");

    el.innerHTML = expanded;
    el.setAttribute("data-z10-expanded", "true");

    // Scope any template-level data-z10-id attributes to this instance
    // so that multiple instances don't share the same child IDs.
    // Template IDs like "cmp-EmailRow-1" become instance-scoped so
    // querySelector always finds the correct one.
    const instanceId = el.getAttribute("data-z10-id");
    if (instanceId) {
      const children = el.querySelectorAll("[data-z10-id]");
      for (const child of children) {
        const childId = child.getAttribute("data-z10-id");
        if (childId && childId.startsWith("cmp-")) {
          child.setAttribute("data-z10-id", `${instanceId}::${childId}`);
        }
      }
    }

    // Apply any stored style overrides for this instance
    const overridesStr = el.getAttribute("data-z10-overrides");
    if (overridesStr && instanceId) {
      try {
        const overrides: Record<string, Record<string, string>> = JSON.parse(overridesStr);
        for (const [templateChildId, styles] of Object.entries(overrides)) {
          const scopedId = `${instanceId}::${templateChildId}`;
          const childEl = el.querySelector(`[data-z10-id="${scopedId}"]`) as HTMLElement | null;
          if (childEl) {
            for (const [prop, value] of Object.entries(styles)) {
              childEl.style.setProperty(prop, value);
            }
          }
        }
      } catch { /* ignore malformed overrides */ }
    }
  }
}

/**
 * Collapse component instances by clearing their innerHTML.
 * Used before serialization to avoid persisting expanded template content.
 * Works on a cloned DOM so the visual rendering is not disturbed.
 *
 * Returns the cleaned innerHTML string.
 */
export function serializeWithCollapsedInstances(containerEl: HTMLElement): string {
  const clone = containerEl.cloneNode(true) as HTMLElement;

  // Remove injected component styles
  const injectedStyles = clone.querySelector("[data-z10-component-styles-injected]");
  if (injectedStyles) injectedStyles.remove();

  // Collapse all expanded component instances
  const expanded = clone.querySelectorAll("[data-z10-expanded]");
  for (const el of expanded) {
    (el as HTMLElement).innerHTML = "";
    el.removeAttribute("data-z10-expanded");
  }

  return clone.innerHTML;
}
