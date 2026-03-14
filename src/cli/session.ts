/**
 * CLI Session State Manager
 *
 * Manages persistent session state in ~/.z10/ for the CLI.
 * Stores auth tokens, current project/page context, and cached DOM state.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SessionState {
  authToken?: string;
  serverUrl?: string;
  currentProjectId?: string;
  currentPageId?: string;
}

const Z10_DIR = join(homedir(), '.z10');
const SESSION_FILE = join(Z10_DIR, 'session.json');
const DOM_CACHE_FILE = join(Z10_DIR, 'dom-cache.html');

async function ensureDir(): Promise<void> {
  await mkdir(Z10_DIR, { recursive: true });
}

export async function loadSession(): Promise<SessionState> {
  try {
    const data = await readFile(SESSION_FILE, 'utf-8');
    return JSON.parse(data) as SessionState;
  } catch {
    return {};
  }
}

export async function saveSession(state: SessionState): Promise<void> {
  await ensureDir();
  await writeFile(SESSION_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function updateSession(updates: Partial<SessionState>): Promise<SessionState> {
  const current = await loadSession();
  const merged = { ...current, ...updates };
  await saveSession(merged);
  return merged;
}

export async function clearSession(): Promise<void> {
  await ensureDir();
  await writeFile(SESSION_FILE, '{}', 'utf-8');
}

export async function saveDomCache(html: string): Promise<void> {
  await ensureDir();
  await writeFile(DOM_CACHE_FILE, html, 'utf-8');
}

export async function loadDomCache(): Promise<string | null> {
  try {
    return await readFile(DOM_CACHE_FILE, 'utf-8');
  } catch {
    return null;
  }
}

export function getZ10Dir(): string {
  return Z10_DIR;
}

export function requireSession(session: SessionState, field: keyof SessionState, message: string): string {
  const value = session[field];
  if (!value) {
    console.error(message);
    process.exit(1);
  }
  return value;
}

/**
 * Extract a named flag value from args array.
 * Returns the value after the flag, or undefined if not present.
 */
export function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

/**
 * Resolve project ID from --project flag or session state.
 * Exits with error if neither is available.
 */
export function resolveProjectId(args: string[], session: SessionState): string {
  const fromFlag = extractFlag(args, '--project');
  const projectId = fromFlag ?? session.currentProjectId;
  if (!projectId) {
    console.error('No project specified. Use --project <id> or run `z10 project load <id>` first.');
    process.exit(1);
  }
  return projectId;
}

/**
 * Resolve page ID from --page flag or session state.
 * Returns undefined if neither is available (page is optional).
 */
export function resolvePageId(args: string[], session: SessionState): string | undefined {
  return extractFlag(args, '--page') ?? session.currentPageId ?? undefined;
}
