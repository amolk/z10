/**
 * CLI flag parsing utilities.
 *
 * Pure functions over string arrays — no I/O dependencies.
 * Extracted from session.ts to separate concerns.
 */

import type { SessionState } from './session.js';

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
 * Check args for unknown flags and exit with error if found.
 */
export function rejectUnknownFlags(args: string[], knownFlags: string[]): void {
  for (const arg of args) {
    if (arg.startsWith('--') && !knownFlags.includes(arg)) {
      console.error(`Unknown flag: ${arg}`);
      console.error(`Valid flags: ${knownFlags.join(', ')}`);
      process.exit(1);
    }
  }
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
