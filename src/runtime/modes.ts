/**
 * Mode switching for Z10 runtime.
 *
 * Handles light/dark mode toggling on Z10 documents.
 * Modes affect which semantic tokens are active and which
 * data-z10-mode attribute is set on page containers.
 */

import type { Z10Document, DisplayMode, Z10Page } from '../core/types.js';

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

/**
 * Switch a specific page to a new display mode.
 * Updates the page's mode property.
 *
 * @returns true if the mode was changed, false if already in that mode
 */
export function setPageMode(doc: Z10Document, pageName: string, mode: DisplayMode): boolean {
  const page = doc.pages.find(p => p.name === pageName);
  if (!page) return false;
  if (page.mode === mode) return false;
  page.mode = mode;
  return true;
}

/**
 * Toggle a page between light and dark mode.
 *
 * @returns The new mode after toggling
 */
export function togglePageMode(doc: Z10Document, pageName: string): DisplayMode | null {
  const page = doc.pages.find(p => p.name === pageName);
  if (!page) return null;
  page.mode = page.mode === 'light' ? 'dark' : 'light';
  return page.mode;
}

/**
 * Switch all pages to a new display mode.
 *
 * @returns Number of pages that were changed
 */
export function setAllPagesMode(doc: Z10Document, mode: DisplayMode): number {
  let changed = 0;
  for (const page of doc.pages) {
    if (page.mode !== mode) {
      page.mode = mode;
      changed++;
    }
  }
  return changed;
}

/**
 * Switch the document's default mode and update all pages.
 */
export function setDocumentMode(doc: Z10Document, mode: DisplayMode): void {
  doc.config.defaultMode = mode;
  setAllPagesMode(doc, mode);
}

/**
 * Get the current mode for a page.
 */
export function getPageMode(doc: Z10Document, pageName: string): DisplayMode | null {
  const page = doc.pages.find(p => p.name === pageName);
  return page?.mode ?? null;
}

/**
 * Get all pages with their current modes.
 */
export function getAllPageModes(doc: Z10Document): Array<{ name: string; mode: DisplayMode }> {
  return doc.pages.map(p => ({ name: p.name, mode: p.mode }));
}

/**
 * Check if a document has mixed modes (some pages light, some dark).
 */
export function hasMixedModes(doc: Z10Document): boolean {
  if (doc.pages.length <= 1) return false;
  const firstMode = doc.pages[0]!.mode;
  return doc.pages.some(p => p.mode !== firstMode);
}

// ---------------------------------------------------------------------------
// Mode-aware token resolution
// ---------------------------------------------------------------------------

/**
 * Get the effective value of a semantic token for a given mode.
 * Semantic tokens can have mode-specific values stored as:
 *   --token-name-light / --token-name-dark
 * or just --token-name for mode-independent values.
 */
export function resolveTokenForMode(
  doc: Z10Document,
  tokenName: string,
  mode: DisplayMode,
): string | null {
  // First check for mode-specific token
  const modeSpecific = doc.tokens.semantic.get(`${tokenName}-${mode}`);
  if (modeSpecific) return modeSpecific.value;

  // Fall back to base token
  const base = doc.tokens.semantic.get(tokenName);
  if (base) return base.value;

  // Check primitives as last resort
  const primitive = doc.tokens.primitives.get(tokenName);
  if (primitive) return primitive.value;

  return null;
}
