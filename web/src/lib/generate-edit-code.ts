/**
 * D4. Generate JS code strings from human edit operations.
 *
 * Converts UI edit operations (style changes, attribute changes, text edits,
 * element creation/removal) into JS code that can be executed by the server's
 * transaction engine — the same code format agents use.
 *
 * All generated code addresses nodes by `data-z10-id` via
 * `document.querySelector('[data-z10-id="..."]')`.
 *
 * §10.2
 */

/**
 * Generate JS code for setting style properties on an element.
 *
 * @example
 * generateStyleCode("card", { width: "200px", "background-color": "red" })
 * // => 'const el = document.querySelector(\'[data-z10-id="card"]\');\nel.style.setProperty("width", "200px");\nel.style.setProperty("background-color", "red");'
 */
export function generateStyleCode(
  id: string,
  styles: Record<string, string>,
): string {
  const entries = Object.entries(styles);
  if (entries.length === 0) return "";

  const safeId = escapeId(id);
  const lines = [`const el = document.querySelector('[data-z10-id="${safeId}"]');`];
  for (const [prop, value] of entries) {
    lines.push(`el.style.setProperty(${JSON.stringify(prop)}, ${JSON.stringify(value)});`);
  }
  return lines.join("\n");
}

/**
 * Generate JS code for setting an attribute on an element.
 */
export function generateAttrCode(
  id: string,
  name: string,
  value: string,
): string {
  const safeId = escapeId(id);
  return `document.querySelector('[data-z10-id="${safeId}"]').setAttribute(${JSON.stringify(name)}, ${JSON.stringify(value)});`;
}

/**
 * Generate JS code for setting text content on an element.
 */
export function generateTextCode(
  id: string,
  text: string,
): string {
  const safeId = escapeId(id);
  return `document.querySelector('[data-z10-id="${safeId}"]').textContent = ${JSON.stringify(text)};`;
}

/**
 * Generate JS code for removing an element from the DOM.
 */
export function generateRemoveCode(id: string): string {
  const safeId = escapeId(id);
  return `document.querySelector('[data-z10-id="${safeId}"]')?.remove();`;
}

/**
 * Generate JS code for creating a new element and appending to a parent.
 */
export function generateAddCode(
  parentId: string,
  html: string,
  beforeId?: string | null,
): string {
  const safeParentId = escapeId(parentId);
  const lines = [
    `const parent = document.querySelector('[data-z10-id="${safeParentId}"]');`,
    `const temp = document.createElement("div");`,
    `temp.innerHTML = ${JSON.stringify(html)};`,
    `const newEl = temp.firstElementChild;`,
  ];
  if (beforeId) {
    const safeBeforeId = escapeId(beforeId);
    lines.push(
      `const ref = parent.querySelector('[data-z10-id="${safeBeforeId}"]');`,
      `parent.insertBefore(newEl, ref);`,
    );
  } else {
    lines.push(`parent.appendChild(newEl);`);
  }
  return lines.join("\n");
}

/**
 * Generate JS code for reparenting an element into a new container.
 */
export function generateReparentCode(
  id: string,
  newParentId: string,
  beforeId?: string | null,
): string {
  const safeId = escapeId(id);
  const safeParentId = escapeId(newParentId);
  const lines = [
    `const el = document.querySelector('[data-z10-id="${safeId}"]');`,
    `const parent = document.querySelector('[data-z10-id="${safeParentId}"]');`,
  ];
  if (beforeId) {
    const safeBeforeId = escapeId(beforeId);
    lines.push(
      `const ref = parent.querySelector('[data-z10-id="${safeBeforeId}"]');`,
      `parent.insertBefore(el, ref);`,
    );
  } else {
    lines.push(`parent.appendChild(el);`);
  }
  return lines.join("\n");
}

/** Escape special characters in data-z10-id values for use in selectors. */
function escapeId(id: string): string {
  return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
