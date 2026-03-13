/**
 * A3. Style string utilities.
 * parseStyleString(str) → Map<string, string>
 * diffStyleProperties(oldMap, newMap) → string[] of changed property names.
 * Used by write set builder (A5) and patch serializer (A14).
 * §5.2 Step 8, §6.4
 */

/**
 * Parse a CSS style string into a Map of property → value.
 * Handles edge cases: trailing semicolons, extra whitespace, empty values.
 */
export function parseStyleString(str: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!str || !str.trim()) return map;

  const declarations = str.split(';');
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;

    // Split on first colon only (values may contain colons, e.g. url())
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const property = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (property && value) {
      map.set(property, value);
    }
  }

  return map;
}

/**
 * Diff two style maps and return the property names that changed.
 * A property "changed" if it was added, removed, or its value differs.
 */
export function diffStyleProperties(
  oldMap: Map<string, string>,
  newMap: Map<string, string>,
): string[] {
  const changed: string[] = [];

  // Properties in newMap that are added or changed
  for (const [prop, value] of newMap) {
    if (!oldMap.has(prop) || oldMap.get(prop) !== value) {
      changed.push(prop);
    }
  }

  // Properties in oldMap that were removed
  for (const prop of oldMap.keys()) {
    if (!newMap.has(prop)) {
      changed.push(prop);
    }
  }

  return changed;
}
