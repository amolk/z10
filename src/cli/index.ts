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
 *
 * Agent Scripting Commands:
 *   z10 login --token <token>  Authenticate with z10 server
 *   z10 logout                 Clear authentication
 *   z10 project list            List all projects
 *   z10 project load <id>      Set current project context
 *   z10 page list              List pages in current project
 *   z10 page load <id>         Set current page context
 *   z10 dom [--full]           Show current page DOM
 *   z10 exec                   Execute JavaScript from stdin
 *   z10 components             List registered Web Components
 *   z10 tokens                 List design tokens
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
import { exportWebComponents } from '../export/web-components.js';
import { cmdLogin, cmdLogout, cmdProjectLoad, cmdProjectList, cmdPageLoad, cmdPageList, cmdComponents, cmdTokens } from './commands.js';
import { cmdExec } from './exec.js';
import { cmdDom } from './dom.js';
import { cmdComponent } from './component.js';
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
    case 'login':
      await cmdLogin(args.slice(1));
      break;
    case 'logout':
      await cmdLogout();
      break;
    case 'project':
      if (args[1] === 'load') {
        await cmdProjectLoad(args.slice(2));
      } else if (args[1] === 'list') {
        await cmdProjectList([]);
      } else {
        console.error('Usage: z10 project <list|load <project-id>>');
        process.exit(1);
      }
      break;
    case 'page':
      if (args[1] === 'load') {
        await cmdPageLoad(args.slice(2));
      } else if (args[1] === 'list') {
        await cmdPageList(args.slice(2));
      } else {
        console.error('Usage: z10 page <list [--project <id>]|load <page-id>>');
        process.exit(1);
      }
      break;
    case 'dom':
      if (args[1] === 'exec') {
        await cmdExec(args.slice(2));
      } else {
        await cmdDom(args.slice(1));
      }
      break;
    case 'exec':
      await cmdExec(args.slice(1));
      break;
    case 'component':
      await cmdComponent(args.slice(1));
      break;
    case 'components':
      await cmdComponents(args.slice(1));
      break;
    case 'tokens':
      await cmdTokens(args.slice(1));
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
    console.error('Usage: z10 export <file.z10.html> [--format react|vue|svelte|web-components] [--id <nodeId>] [--out <output>] [--js]');
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

  // Build a DOM Element from the document for the exporters
  const { Window } = await import('happy-dom');
  const win = new Window();
  win.document.documentElement.innerHTML = serializeZ10Html(doc);
  const rootEl = win.document.body as unknown as Element;
  const selector = id ? `[data-z10-id="${id}"]` : undefined;
  const context = {
    components: Array.from(doc.components.values()),
    tokens: { primitives: doc.tokens.primitives, semantic: doc.tokens.semantic },
  };

  if (format === 'vue') {
    result = exportVue(rootEl, { selector, typescript: !useJs, includeTokens: true, context });
  } else if (format === 'svelte') {
    result = exportSvelte(rootEl, { selector, typescript: !useJs, includeTokens: true, context });
  } else if (format === 'react') {
    result = exportReact(rootEl, { selector, typescript: !useJs, includeTokens: true, context });
  } else if (format === 'web-components') {
    const schemas = Array.from(doc.components.values());
    result = exportWebComponents(schemas, {
      name: id,
      includeTokens: true,
      tokens: { primitives: doc.tokens.primitives, semantic: doc.tokens.semantic },
    });
  } else {
    console.error(`Unknown format: ${format}. Supported: react, vue, svelte, web-components`);
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
  z10 export <file> [opts]   Export to React/Vue/Svelte code
  z10 config <file> [k] [v]  Get/set project configuration
  z10 branch [name]          Create/list design branches
  z10 diff <ref1>..<ref2>    Semantic diff between Git refs
  z10 merge <branch>         Merge a design branch
  z10 sync --design <file>   Check design file status

Agent Scripting:
  z10 login --token <token>  Authenticate with z10 server
  z10 logout                 Clear authentication
  z10 project list           List all projects
  z10 project load <id>      Set current project context
  z10 page list [--project]  List pages in project
  z10 page load <id>         Set current page context
  z10 dom [--full] [flags]   Show current page DOM tree
  z10 exec [flags]           Execute JavaScript from stdin
  z10 component <sub> [args] Component CRUD (list|show|create|edit|delete)
  z10 components [--project] List registered Web Components (shorthand)
  z10 tokens [--project]     List design tokens

Inline Flags (override session state):
  --project <id>             Use specific project (skip 'project load')
  --page <id>                Use specific page (skip 'page load')

  z10 --version              Show version
  z10 --help                 Show this help

Agent Workflow:
  z10 login --token <your-token>
  z10 project load <project-id>
  z10 exec <<'EOF'
  const nav = document.getElementById('left-nav');
  nav.appendChild(document.createElement('div'));
  EOF

MCP Connection:
  claude mcp add zero10 --transport http http://127.0.0.1:29910/mcp --scope user
`.trim());
}

main().then(() => {
  // Commands like 'serve' never return (long-running server).
  // For all other commands, force exit to avoid hanging on open handles
  // (e.g. Node.js fetch keep-alive connections).
  if (command !== 'serve') {
    process.exit(0);
  }
}).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
