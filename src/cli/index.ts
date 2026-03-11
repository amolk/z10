#!/usr/bin/env node

/**
 * Zero-10 CLI
 *
 * Commands:
 *   z10 serve [file]           Start the MCP server (default port 29910)
 *   z10 new [name]             Create a new .z10.html file
 *   z10 info [file]            Show document summary
 *   z10 branch [name]          Create/list design branches
 *   z10 diff <ref1>..<ref2>    Semantic diff of .z10.html files
 *   z10 merge <branch>         Merge a design branch
 *   z10 sync --design <file>   Check design file sync status
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from '../mcp/server.js';
import { createDocument, addNode, createNode, addPage, setTokens } from '../core/document.js';
import { serializeZ10Html } from '../format/serializer.js';
import { parseZ10Html } from '../format/parser.js';
import { cmdBranch, cmdDiff, cmdMerge, cmdSync } from './git.js';

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  switch (command) {
    case 'serve':
      await cmdServe();
      break;
    case 'new':
      await cmdNew();
      break;
    case 'info':
      await cmdInfo();
      break;
    case 'branch':
      await cmdBranch(args.slice(1));
      break;
    case 'diff':
      await cmdDiff(args.slice(1));
      break;
    case 'merge':
      await cmdMerge(args.slice(1));
      break;
    case 'sync':
      await cmdSync(args.slice(1));
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    case '--version':
    case '-v':
      console.log('z10 0.1.0');
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run z10 --help for usage.');
      process.exit(1);
  }
}

async function cmdServe(): Promise<void> {
  const filePath = args[1] ? resolve(args[1]) : undefined;
  const portFlag = args.indexOf('--port');
  const portStr = portFlag !== -1 ? args[portFlag + 1] : undefined;
  const port = portStr ? parseInt(portStr, 10) : undefined;

  await startServer({ filePath, port });
}

async function cmdNew(): Promise<void> {
  const name = args[1] ?? 'Untitled';
  const fileName = args[2] ?? `${name.toLowerCase().replace(/\s+/g, '-')}.z10.html`;
  const filePath = resolve(fileName);

  const doc = createDocument({ name });

  // Set up default tokens
  setTokens(doc, 'primitives', {
    '--gray-50': '#f9fafb',
    '--gray-100': '#f3f4f6',
    '--gray-200': '#e5e7eb',
    '--gray-300': '#d1d5db',
    '--gray-400': '#9ca3af',
    '--gray-500': '#6b7280',
    '--gray-600': '#4b5563',
    '--gray-700': '#374151',
    '--gray-800': '#1f2937',
    '--gray-900': '#111827',
    '--blue-500': '#3b82f6',
    '--blue-600': '#2563eb',
    '--white': '#ffffff',
    '--black': '#000000',
  });

  setTokens(doc, 'semantic', {
    '--primary': 'var(--blue-500)',
    '--primary-hover': 'var(--blue-600)',
    '--bg': 'var(--white)',
    '--bg-secondary': 'var(--gray-50)',
    '--text': 'var(--gray-900)',
    '--text-secondary': 'var(--gray-500)',
    '--border': 'var(--gray-200)',
  });

  // Create a default page with basic structure
  const root = createNode({ id: 'page_root', tag: 'div', parent: null, intent: 'layout' });
  addNode(doc, root);
  addPage(doc, { name: 'Page 1', rootNodeId: 'page_root', mode: 'light' });

  const html = serializeZ10Html(doc);
  await writeFile(filePath, html, 'utf-8');
  console.log(`Created: ${filePath}`);
}

async function cmdInfo(): Promise<void> {
  const filePath = args[1];
  if (!filePath) {
    console.error('Usage: z10 info <file.z10.html>');
    process.exit(1);
  }

  const html = await readFile(resolve(filePath), 'utf-8');
  const doc = parseZ10Html(html);

  console.log(`Project: ${doc.config.name}`);
  console.log(`Version: ${doc.config.version}`);
  console.log(`Governance: ${doc.config.governance}`);
  console.log(`Pages: ${doc.pages.map(p => p.name).join(', ') || '(none)'}`);
  console.log(`Nodes: ${doc.nodes.size}`);
  console.log(`Components: ${Array.from(doc.components.keys()).join(', ') || '(none)'}`);
  console.log(`Tokens: ${doc.tokens.primitives.size} primitives, ${doc.tokens.semantic.size} semantic`);
}

function printHelp(): void {
  console.log(`
Zero-10 CLI — Branchable UI evolution for the agent era

Usage:
  z10 serve [file]           Start the MCP server (default port 29910)
  z10 new [name]             Create a new .z10.html file
  z10 info <file>            Show document summary
  z10 branch [name]          Create/list design branches (z10/ prefixed)
  z10 diff <ref1>..<ref2>    Semantic diff of .z10.html between Git refs
  z10 merge <branch> [--into <target>]  Merge a design branch
  z10 sync --design <file> [--source <dir>]  Check design file status
  z10 --version              Show version
  z10 --help                 Show this help

MCP Connection:
  claude mcp add zero10 --transport http http://127.0.0.1:29910/mcp --scope user

Examples:
  z10 new "My App"                         Create my-app.z10.html
  z10 serve my-app.z10.html                Start server with file
  z10 info my-app.z10.html                 Show document info
  z10 branch "dark-mode-exploration"       Create a design branch
  z10 diff main..z10/dark-mode-exploration Semantic diff between branches
  z10 merge dark-mode-exploration --into main
  z10 sync --design app.z10.html           Check design status
`.trim());
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
