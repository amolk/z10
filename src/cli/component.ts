/**
 * CLI `z10 component` subcommand dispatcher.
 * CRUD operations for Web Component definitions.
 *
 * Commands:
 *   z10 component list [--verbose]     List components
 *   z10 component show <name>          Full schema + instance count
 *   z10 component create <name>        Create from stdin JSON
 *   z10 component edit <name>          Update from stdin JSON (partial)
 *   z10 component delete <name> [--detach]  Remove definition
 */

import { loadSession, resolveProjectId } from './session.js';
import {
  fetchComponentDetail,
  fetchComponentList,
  createComponent,
  updateComponent,
  deleteComponent,
} from './api.js';

/** Extract positional args from args, stripping known flags and --key value pairs. */
function extractPositionalArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') { i++; continue; } // skip --project and its value
    if (args[i]!.startsWith('--')) continue; // skip all flags
    result.push(args[i]!);
  }
  return result;
}

export async function cmdComponent(args: string[]): Promise<void> {
  const sub = args[0];
  const session = await loadSession();
  const projectId = resolveProjectId(args.slice(1), session);

  if (!projectId) {
    console.error('No project context. Run `z10 project load <id>` or pass --project <id>.');
    process.exit(1);
  }

  // Extract positional args after the subcommand, ignoring flags
  const positional = extractPositionalArgs(args.slice(1));
  const nameArg = positional[0] ?? '';

  switch (sub) {
    case 'list':
      await cmdList(projectId, args.includes('--verbose'));
      break;
    case 'show':
      await cmdShow(projectId, nameArg);
      break;
    case 'create':
      await cmdCreate(projectId, nameArg);
      break;
    case 'edit':
      await cmdEdit(projectId, nameArg);
      break;
    case 'delete':
      await cmdDelete(projectId, nameArg, args.includes('--detach'));
      break;
    default:
      console.error(`Usage: z10 component <list|show|create|edit|delete> [name] [flags]
  list [--verbose]     List components (names or full detail)
  show <name>          Full schema + instance count
  create <name>        Create from stdin JSON definition
  edit <name>          Update from stdin JSON (partial)
  delete <name> [--detach]  Remove definition, optionally detach instances`);
      process.exit(1);
  }
}

async function cmdList(projectId: string, verbose: boolean): Promise<void> {
  const result = await fetchComponentList(projectId, verbose);
  if (verbose) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.components.length === 0) {
      console.log('No components registered.');
    } else {
      for (const name of result.components) {
        console.log(name);
      }
    }
  }
}

async function cmdShow(projectId: string, name: string): Promise<void> {
  if (!name) {
    console.error('Usage: z10 component show <name>');
    process.exit(1);
  }
  const detail = await fetchComponentDetail(projectId, name);
  console.log(JSON.stringify(detail, null, 2));
}

async function cmdCreate(projectId: string, name: string): Promise<void> {
  if (!name) {
    console.error('Usage: z10 component create <name>');
    console.error('Reads component definition JSON from stdin.');
    process.exit(1);
  }

  const input = await readStdin();
  let definition: Record<string, unknown>;
  try {
    definition = JSON.parse(input);
  } catch {
    console.error('Invalid JSON on stdin');
    process.exit(1);
    return;
  }

  const result = await createComponent(projectId, name, definition);
  console.log(`Component "${name}" created.`);
  if (result.tagName) {
    console.log(`Tag: <${result.tagName}>`);
  }
}

async function cmdEdit(projectId: string, name: string): Promise<void> {
  if (!name) {
    console.error('Usage: z10 component edit <name>');
    console.error('Reads partial component definition JSON from stdin.');
    process.exit(1);
  }

  const input = await readStdin();
  let definition: Record<string, unknown>;
  try {
    definition = JSON.parse(input);
  } catch {
    console.error('Invalid JSON on stdin');
    process.exit(1);
    return;
  }

  await updateComponent(projectId, name, definition);
  console.log(`Component "${name}" updated.`);
}

async function cmdDelete(projectId: string, name: string, detach: boolean): Promise<void> {
  if (!name) {
    console.error('Usage: z10 component delete <name> [--detach]');
    process.exit(1);
  }

  await deleteComponent(projectId, name, detach);
  console.log(`Component "${name}" deleted.${detach ? ' Instances detached.' : ''}`);
}

/** Read all of stdin as a string. Prompts if stdin is a TTY. */
function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    console.error('Paste component JSON, then press Ctrl+D to submit:');
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

