/**
 * z10 dom — Retrieve and display the current page DOM state.
 *
 * In online mode, fetches from the server and updates the local cache.
 * In offline mode, reads from the local cache.
 *
 * Supports compact tree view (default) and full HTML (--full).
 */

import { loadSession, saveDomCache, updateSession, requireSession } from './session.js';
import { loadDomCache } from './session.js';
import { fetchDom } from './api.js';
import { computeChecksum } from './checksum.js';

/**
 * Generate a compact tree view of HTML.
 * Shows element structure with data-z10-id attributes.
 */
export function compactTreeView(html: string, indent: number = 0): string {
  // Simple regex-based tree view for compact display
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  // Parse tags and create indented tree
  let depth = 0;
  const tagRegex = /<(\/?)([\w-]+)([^>]*)>/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [, closing, tag, attrs] = match as unknown as [string, string, string, string];

    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    const indent = '  '.repeat(depth);

    // Extract key attributes
    const id = attrs.match(/data-z10-id="([^"]+)"/)?.[1]
      ?? attrs.match(/id="([^"]+)"/)?.[1];
    const component = attrs.match(/data-z10-component="([^"]+)"/)?.[1];
    const intent = attrs.match(/data-z10-intent="([^"]+)"/)?.[1];
    const classes = attrs.match(/class="([^"]+)"/)?.[1];

    let label = tag;
    if (component) label = `${tag} [${component}]`;
    if (id) label += ` #${id}`;
    if (intent) label += ` (${intent})`;
    if (classes) label += ` .${classes.split(' ').join('.')}`;

    lines.push(`${indent}${label}`);

    // Self-closing tags don't increase depth
    if (!attrs.endsWith('/') && !['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tag)) {
      depth++;
    }
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
    // Online mode: fetch from server
    try {
      const result = await fetchDom(session.currentProjectId, {
        compact: !full,
        pageId: session.currentPageId,
      });

      await saveDomCache(result.html);
      await updateSession({ domChecksum: result.checksum });

      if (full) {
        console.log(result.html);
      } else {
        console.log(compactTreeView(result.html));
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
    console.log(cached);
  } else {
    console.log(compactTreeView(cached));
  }
}
