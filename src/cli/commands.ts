/**
 * CLI commands for agent scripting workflow.
 *
 * Commands: login, project load, page load, components, tokens
 */

import { loadSession, updateSession, clearSession, requireSession, resolveProjectId, resolvePageId, rejectUnknownFlags } from './session.js';
import { fetchComponents, fetchTokens, fetchDom, fetchProjects, fetchPages } from './api.js';
import { saveDomCache } from './session.js';

/**
 * z10 login — Authenticate with z10 server.
 *
 * Usage:
 *   z10 login --token <api-token>
 *   z10 login --server <url> --token <api-token>
 */
export async function cmdLogin(args: string[]): Promise<void> {
  rejectUnknownFlags(args, ['--token', '--server']);
  const tokenIdx = args.indexOf('--token');
  const serverIdx = args.indexOf('--server');

  if (tokenIdx === -1 || !args[tokenIdx + 1]) {
    console.error('Usage: z10 login --token <api-token> [--server <url>]');
    console.error('\nAuthenticate with the z10 server.');
    console.error('Get your API token from the z10 dashboard.');
    process.exit(1);
  }

  const token = args[tokenIdx + 1]!;
  const serverUrl = serverIdx !== -1 ? args[serverIdx + 1] : undefined;

  const updates: Record<string, string> = { authToken: token };
  if (serverUrl) updates['serverUrl'] = serverUrl;

  await updateSession(updates);
  console.log('✓ Logged in successfully');
  if (serverUrl) console.log(`  Server: ${serverUrl}`);
}

/**
 * z10 logout — Clear authentication.
 */
export async function cmdLogout(): Promise<void> {
  await clearSession();
  console.log('✓ Logged out');
}

/**
 * z10 project load <project-id> — Set current project context.
 *
 * Fetches the project's DOM and caches it locally.
 */
export async function cmdProjectLoad(args: string[]): Promise<void> {
  const projectId = args[0];

  if (!projectId) {
    console.error('Usage: z10 project load <project-id>');
    process.exit(1);
  }

  await updateSession({ currentProjectId: projectId, currentPageId: undefined });

  // Try to fetch and cache DOM
  try {
    const result = await fetchDom(projectId);
    await saveDomCache(result.html);
    console.log(`✓ Project loaded: ${projectId}`);
  } catch {
    console.log(`✓ Project set: ${projectId}`);
    console.log('  ⚠ Could not fetch DOM from server (offline mode)');
  }
}

/**
 * z10 project list — List all projects in the logged-in account.
 */
export async function cmdProjectList(): Promise<void> {
  try {
    const projectList = await fetchProjects();

    if (projectList.length === 0) {
      console.log('No projects found.');
      return;
    }

    console.log('Projects:');
    for (const p of projectList) {
      const updated = p.updatedAt ? `  (updated ${p.updatedAt})` : '';
      console.log(`  ${p.id}  ${p.name}${updated}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to list projects: ${msg}`);
    process.exit(1);
  }
}

/**
 * z10 page list [--project <id>] — List pages in the current project.
 */
export async function cmdPageList(args: string[] = []): Promise<void> {
  rejectUnknownFlags(args, ['--project']);
  const session = await loadSession();
  const projectId = resolveProjectId(args, session);

  try {
    const pages = await fetchPages(projectId);

    if (pages.length === 0) {
      console.log('No pages found.');
      return;
    }

    console.log('Pages:');
    for (const p of pages) {
      console.log(`  ${p.rootNodeId}  ${p.name}  (${p.mode})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to list pages: ${msg}`);
    process.exit(1);
  }
}

/**
 * z10 page load <page-id> — Set current page context.
 */
export async function cmdPageLoad(args: string[]): Promise<void> {
  const session = await loadSession();
  requireSession(session, 'currentProjectId', 'No project loaded. Run `z10 project load <id>` first.');

  const pageId = args[0];
  if (!pageId) {
    console.error('Usage: z10 page load <page-id>');
    process.exit(1);
  }

  await updateSession({ currentPageId: pageId });

  // Refresh DOM for the new page
  try {
    const result = await fetchDom(session.currentProjectId!, { pageId });
    await saveDomCache(result.html);
    console.log(`✓ Page loaded: ${pageId}`);
  } catch {
    console.log(`✓ Page set: ${pageId}`);
    console.log('  ⚠ Could not fetch DOM from server');
  }
}

/**
 * z10 components [--project <id>] — List registered Web Components.
 */
export async function cmdComponents(args: string[]): Promise<void> {
  rejectUnknownFlags(args, ['--project']);
  const session = await loadSession();
  const projectId = resolveProjectId(args, session);

  try {
    const components = await fetchComponents(projectId);

    if (components.length === 0) {
      console.log('No components registered.');
      return;
    }

    console.log('Components:');
    for (const name of components) {
      console.log(`  ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to fetch components: ${msg}`);
    process.exit(1);
  }
}

/**
 * z10 tokens [--project <id>] — List design tokens.
 */
export async function cmdTokens(args: string[]): Promise<void> {
  rejectUnknownFlags(args, ['--project']);
  const session = await loadSession();
  const projectId = resolveProjectId(args, session);

  try {
    const tokens = await fetchTokens(projectId);

    const primCount = Object.keys(tokens.primitives).length;
    const semCount = Object.keys(tokens.semantic).length;

    if (primCount === 0 && semCount === 0) {
      console.log('No tokens defined.');
      return;
    }

    if (primCount > 0) {
      console.log('Primitives:');
      for (const [key, value] of Object.entries(tokens.primitives)) {
        console.log(`  ${key}: ${value}`);
      }
    }

    if (semCount > 0) {
      if (primCount > 0) console.log('');
      console.log('Semantic:');
      for (const [key, value] of Object.entries(tokens.semantic)) {
        console.log(`  ${key}: ${value}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to fetch tokens: ${msg}`);
    process.exit(1);
  }
}
