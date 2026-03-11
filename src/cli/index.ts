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
 *   z10 export <file>          Export to React + Tailwind code
 *   z10 config <file> [key] [value]  Get/set config values
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from '../mcp/server.js';
import { createDocument, addNode, createNode, addPage, setTokens } from '../core/document.js';
import { serializeZ10Html } from '../format/serializer.js';
import { parseZ10Html } from '../format/parser.js';
import { cmdBranch, cmdDiff, cmdMerge, cmdSync } from './git.js';
import { getConfigValue, setConfigValue, CONFIG_KEYS } from '../core/config.js';
import { exportReact } from '../export/react.js';
import { exportVue } from '../export/vue.js';
import { exportSvelte } from '../export/svelte.js';
import type { ProjectConfig } from '../core/types.js';

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
    case 'config':
      await cmdConfig();
      break;
    case 'export':
      await cmdExport();
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

async function cmdConfig(): Promise<void> {
  const filePath = args[1];
  if (!filePath) {
    console.error('Usage: z10 config <file.z10.html> [key] [value]');
    console.error('\nAvailable keys:');
    for (const entry of CONFIG_KEYS) {
      const valid = entry.validValues ? ` (${entry.validValues})` : '';
      console.error(`  ${entry.key} — ${entry.description}${valid}`);
    }
    process.exit(1);
  }

  const absPath = resolve(filePath);
  const html = await readFile(absPath, 'utf-8');
  const doc = parseZ10Html(html);
  const key = args[2] as keyof ProjectConfig | undefined;

  // z10 config <file> — show all config
  if (!key) {
    for (const entry of CONFIG_KEYS) {
      console.log(`${entry.key}=${getConfigValue(doc, entry.key)}`);
    }
    return;
  }

  // Validate key
  if (!CONFIG_KEYS.some(e => e.key === key)) {
    console.error(`Unknown config key: ${key}`);
    console.error(`Valid keys: ${CONFIG_KEYS.map(e => e.key).join(', ')}`);
    process.exit(1);
  }

  const value = args[3];

  // z10 config <file> <key> — get single value
  if (value === undefined) {
    console.log(getConfigValue(doc, key));
    return;
  }

  // z10 config <file> <key> <value> — set value
  const err = setConfigValue(doc, key, value);
  if (err) {
    console.error(`Error: ${err}`);
    process.exit(1);
  }

  // Save the updated document
  const updatedHtml = serializeZ10Html(doc);
  await writeFile(absPath, updatedHtml, 'utf-8');
  console.log(`${key}=${value}`);
}

async function cmdExport(): Promise<void> {
  const filePath = args[1];
  if (!filePath) {
    console.error('Usage: z10 export <file.z10.html> [--format react|vue] [--id <nodeId>] [--out <output>] [--js]');
    process.exit(1);
  }

  const html = await readFile(resolve(filePath), 'utf-8');
  const doc = parseZ10Html(html);

  const idFlag = args.indexOf('--id');
  const id = idFlag !== -1 ? args[idFlag + 1] : undefined;
  const useJs = args.includes('--js');
  const formatFlag = args.indexOf('--format');
  const format = formatFlag !== -1 ? args[formatFlag + 1] : 'react';

  let result: { code: string; components: string[]; tokensCss?: string };

  if (format === 'vue') {
    result = exportVue(doc, { id, typescript: !useJs, includeTokens: true });
  } else if (format === 'svelte') {
    result = exportSvelte(doc, { id, typescript: !useJs, includeTokens: true });
  } else if (format === 'react') {
    result = exportReact(doc, { id, typescript: !useJs, includeTokens: true });
  } else {
    console.error(`Unknown format: ${format}. Supported: react, vue, svelte`);
    process.exit(1);
  }

  const outFlag = args.indexOf('--out');
  if (outFlag !== -1 && args[outFlag + 1]) {
    const outPath = resolve(args[outFlag + 1]!);
    await writeFile(outPath, result.code, 'utf-8');
    console.log(`Exported: ${outPath}`);
    if (result.tokensCss) {
      const cssPath = outPath.replace(/\.\w+$/, '.tokens.css');
      await writeFile(cssPath, result.tokensCss, 'utf-8');
      console.log(`Tokens: ${cssPath}`);
    }
    console.log(`Components: ${result.components.join(', ')}`);
  } else {
    console.log(result.code);
    if (result.tokensCss) {
      console.log('\n/* --- tokens.css --- */');
      console.log(result.tokensCss);
    }
  }
}

function printHelp(): void {
  console.log(`
Zero-10 CLI — Branchable UI evolution for the agent era

Usage:
  z10 serve [file]           Start the MCP server (default port 29910)
  z10 new [name]             Create a new .z10.html file
  z10 info <file>            Show document summary
  z10 export <file> [--format react|vue|svelte] [--id <id>] [--out <file>] [--js]  Export code
  z10 config <file> [key] [value]  Get/set project configuration
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
  z10 config app.z10.html                  Show all config values
  z10 config app.z10.html governance       Get governance level
  z10 config app.z10.html governance scoped-edit  Set governance
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
