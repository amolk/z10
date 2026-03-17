/**
 * Command context facades — eliminate per-command boilerplate.
 *
 * withProject: resolves session + project ID, creates Z10Client, handles errors.
 * withSession: resolves session only (for commands that don't need a project).
 */

import { Z10Client } from './z10-client.js';
import { loadSession } from './session.js';
import { resolveProjectId, rejectUnknownFlags } from './flags.js';

export interface ProjectContext {
  readonly client: Z10Client;
  readonly projectId: string;
}

export interface SessionContext {
  readonly client: Z10Client;
}

type CommandFn = (args: string[]) => Promise<void>;

/**
 * Wrap a command handler that needs an authenticated project context.
 * Resolves session, creates Z10Client, resolves project ID, handles errors.
 */
export function withProject(
  handler: (ctx: ProjectContext, args: string[]) => Promise<void>,
  knownFlags: string[] = [],
): CommandFn {
  return async (args: string[]) => {
    rejectUnknownFlags(args, ['--project', ...knownFlags]);
    try {
      const session = await loadSession();
      const client = await Z10Client.create();
      const projectId = resolveProjectId(args, session);
      await handler({ client, projectId }, args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg);
      process.exit(1);
    }
  };
}

/**
 * Wrap a command handler that needs an authenticated session (no project required).
 */
export function withSession(
  handler: (ctx: SessionContext, args: string[]) => Promise<void>,
  knownFlags: string[] = [],
): CommandFn {
  return async (args: string[]) => {
    rejectUnknownFlags(args, knownFlags);
    try {
      const client = await Z10Client.create();
      await handler({ client }, args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg);
      process.exit(1);
    }
  };
}
