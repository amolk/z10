/**
 * z10 dom — Retrieve and display the current page DOM state.
 *
 * In online mode, fetches from the server and updates the local cache.
 * In offline mode, reads from the local cache.
 *
 * Supports compact tree view (default) and full HTML (--full).
 */

import { Window, type HTMLElement as HappyElement } from 'happy-dom';
import { loadSession, saveDomCache, updateSession, requireSession } from './session.js';
import { loadDomCache } from './session.js';
import { fetchDom } from './api.js';
import { computeChecksum } from './checksum.js';

/** Tags to skip in tree/full output */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE']);
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

/**
 * Parse HTML and return the page root element for a given pageId,
 * or the body element if no pageId is specified.
 */
function parseAndGetRoot(html: string, pageId?: string): HappyElement | null {
  const window = new Window({ url: 'https://z10.dev' });
  const document = window.document;
  document.body.innerHTML = html;

  if (pageId) {
    return document.querySelector(`[data-z10-id="${pageId}"]`) as HappyElement | null;
  }

  return document.body as unknown as HappyElement;
}

/**
 * Extract a single page's inner HTML from full project content by its root node ID.
 * Returns only the children of the page div — since document.body maps to the
 * page root in the exec environment, the agent should see its contents, not the
 * page element itself.
 */
function extractPageInner(html: string, pageId: string): string {
  const root = parseAndGetRoot(html, pageId);
  return root?.innerHTML ?? html;
}

/**
 * Generate a compact tree view of HTML.
 * Shows element structure with data-z10-id attributes.
 */
export function compactTreeView(html: string, pageId?: string): string {
  const root = parseAndGetRoot(html, pageId);
  if (!root) return '';

  // When a page is scoped, show children of the page root.
  // Otherwise show children of body (skipping script/style).
  const children = Array.from(root.children) as HappyElement[];
  const startNodes = pageId
    ? children
    : children.filter(c => !SKIP_TAGS.has(c.tagName));

  const lines: string[] = [];

  function walk(el: HappyElement, depth: number) {
    if (SKIP_TAGS.has(el.tagName)) return;

    const indent = '  '.repeat(depth);
    const tag = el.tagName.toLowerCase();

    const z10Id = el.getAttribute('data-z10-id');
    const id = z10Id ?? el.getAttribute('id');
    const component = el.getAttribute('data-z10-component');
    const intent = el.getAttribute('data-z10-intent');
    const classes = el.getAttribute('class');

    let label = tag;
    if (component) label = `${tag} [${component}]`;
    if (id) label += ` #${id}`;
    if (intent) label += ` (${intent})`;
    if (classes) label += ` .${classes.split(' ').join('.')}`;

    lines.push(`${indent}${label}`);

    if (!VOID_TAGS.has(tag)) {
      for (const child of Array.from(el.children) as HappyElement[]) {
        walk(child, depth + 1);
      }
    }
  }

  for (const node of startNodes) {
    walk(node, 0);
  }

  return lines.join('\n');
}

/**
 * CLI entry point for `z10 dom`.
 */
export async function cmdDom(args: string[]): Promise<void> {
  const full = args.includes('--full');
  const offline = args.includes('--offline');
  const session = await loadSession();

  if (!offline && session.currentProjectId) {
    // Online mode: fetch full DOM for caching, then filter to current page for display
    try {
      const raw = await fetchDom(session.currentProjectId);

      await saveDomCache(raw.html);
      await updateSession({ domChecksum: raw.checksum });

      if (full) {
        const display = session.currentPageId
          ? `<body>\n${extractPageInner(raw.html, session.currentPageId)}\n</body>`
          : raw.html;
        console.log(display.replace(/\n{3,}/g, '\n\n'));
      } else {
        console.log(compactTreeView(raw.html, session.currentPageId ?? undefined));
      }
      return;
    } catch (err) {
      // Fallback to cache if server unavailable
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Server unavailable (${msg}), using cached DOM`);
    }
  }

  // Offline mode or fallback: use cached DOM
  const cached = await loadDomCache();
  if (!cached) {
    console.error('No cached DOM. Run `z10 project load <id>` first or connect to server.');
    process.exit(1);
  }

  if (full) {
    const display = session.currentPageId
      ? `<body>\n${extractPageInner(cached, session.currentPageId)}\n</body>`
      : cached;
    console.log(display.replace(/\n{3,}/g, '\n\n'));
  } else {
    console.log(compactTreeView(cached, session.currentPageId ?? undefined));
  }
}
