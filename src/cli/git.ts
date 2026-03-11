/**
 * Git integration for the z10 CLI.
 *
 * Implements Pillar 1 (Branchable UI Evolution) commands:
 *   z10 branch <name>              Create a Git branch for design exploration
 *   z10 diff <ref1>..<ref2>        Semantic diff of .z10.html between refs
 *   z10 sync --source <dir> --design <file>   Reconciliation foundation
 *   z10 merge <branch> --into <target>        Merge a design branch
 *
 * All commands wrap standard Git operations with z10-specific semantics:
 * - Branch names are prefixed with z10/ for namespacing
 * - Diffs are node-aware (using data-z10-id as stable anchors)
 * - Merge conflicts on .z10.html files are detected and reported
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseZ10Html } from '../format/parser.js';
import type { Z10Document, Z10Node, NodeId, StyleMap } from '../core/types.js';
import { serializeStyle } from '../core/document.js';

const exec = promisify(execFile);

// ---------------------------------------------------------------------------
// Git Helpers
// ---------------------------------------------------------------------------

/** Run a git command and return stdout */
async function git(...args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', args);
    return stdout.trim();
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(error.stderr?.trim() || error.message || 'Git command failed');
  }
}

/** Check if we're in a Git repository */
async function ensureGitRepo(): Promise<void> {
  try {
    await git('rev-parse', '--is-inside-work-tree');
  } catch {
    throw new Error('Not a Git repository. Run "git init" first.');
  }
}

/** Get the current branch name */
async function getCurrentBranch(): Promise<string> {
  return git('rev-parse', '--abbrev-ref', 'HEAD');
}

// ---------------------------------------------------------------------------
// z10 branch
// ---------------------------------------------------------------------------

export async function cmdBranch(args: string[]): Promise<void> {
  await ensureGitRepo();

  const name = args[0];
  if (!name) {
    // List z10 branches
    const branches = await git('branch', '--list', 'z10/*');
    if (!branches) {
      console.log('No z10 branches found.');
    } else {
      console.log('Design branches:');
      console.log(branches);
    }
    return;
  }

  // Sanitize branch name
  const branchName = `z10/${name.replace(/\s+/g, '-').toLowerCase()}`;

  // Create and switch to the branch
  await git('checkout', '-b', branchName);
  console.log(`Created and switched to branch: ${branchName}`);
  console.log(`\nTo switch back: git checkout -`);
  console.log(`To view diff:   z10 diff main..${branchName}`);
}

// ---------------------------------------------------------------------------
// z10 diff
// ---------------------------------------------------------------------------

/** Result of comparing two nodes */
export interface NodeDiff {
  id: NodeId;
  type: 'added' | 'removed' | 'modified';
  changes?: PropertyChange[];
}

/** A single property change on a node */
export interface PropertyChange {
  property: string;
  category: 'style' | 'content' | 'structure' | 'attribute';
  oldValue?: string;
  newValue?: string;
}

/** Full diff result between two document versions */
export interface Z10Diff {
  ref1: string;
  ref2: string;
  added: NodeDiff[];
  removed: NodeDiff[];
  modified: NodeDiff[];
  tokenChanges: PropertyChange[];
  summary: string;
}

/** Compute a semantic diff between two Z10 documents */
export function diffDocuments(docA: Z10Document, docB: Z10Document): Omit<Z10Diff, 'ref1' | 'ref2' | 'summary'> {
  const added: NodeDiff[] = [];
  const removed: NodeDiff[] = [];
  const modified: NodeDiff[] = [];
  const tokenChanges: PropertyChange[] = [];

  // Find removed and modified nodes
  for (const [id, nodeA] of docA.nodes) {
    const nodeB = docB.nodes.get(id);
    if (!nodeB) {
      removed.push({ id, type: 'removed' });
    } else {
      const changes = diffNodes(nodeA, nodeB);
      if (changes.length > 0) {
        modified.push({ id, type: 'modified', changes });
      }
    }
  }

  // Find added nodes
  for (const [id] of docB.nodes) {
    if (!docA.nodes.has(id)) {
      added.push({ id, type: 'added' });
    }
  }

  // Diff tokens
  for (const collection of ['primitives', 'semantic'] as const) {
    const tokensA = docA.tokens[collection];
    const tokensB = docB.tokens[collection];

    for (const [name, tokenA] of tokensA) {
      const tokenB = tokensB.get(name);
      if (!tokenB) {
        tokenChanges.push({
          property: name,
          category: 'style',
          oldValue: tokenA.value,
          newValue: undefined,
        });
      } else if (tokenA.value !== tokenB.value) {
        tokenChanges.push({
          property: name,
          category: 'style',
          oldValue: tokenA.value,
          newValue: tokenB.value,
        });
      }
    }

    for (const [name, tokenB] of tokensB) {
      if (!tokensA.has(name)) {
        tokenChanges.push({
          property: name,
          category: 'style',
          oldValue: undefined,
          newValue: tokenB.value,
        });
      }
    }
  }

  return { added, removed, modified, tokenChanges };
}

/** Compare two nodes and return property-level changes */
function diffNodes(a: Z10Node, b: Z10Node): PropertyChange[] {
  const changes: PropertyChange[] = [];

  // Text content
  if (a.textContent !== b.textContent) {
    changes.push({
      property: 'textContent',
      category: 'content',
      oldValue: a.textContent ?? '',
      newValue: b.textContent ?? '',
    });
  }

  // Tag change
  if (a.tag !== b.tag) {
    changes.push({
      property: 'tag',
      category: 'structure',
      oldValue: a.tag,
      newValue: b.tag,
    });
  }

  // Parent change (reparenting)
  if (a.parent !== b.parent) {
    changes.push({
      property: 'parent',
      category: 'structure',
      oldValue: a.parent ?? '(root)',
      newValue: b.parent ?? '(root)',
    });
  }

  // Children order change
  if (JSON.stringify(a.children) !== JSON.stringify(b.children)) {
    changes.push({
      property: 'children',
      category: 'structure',
      oldValue: a.children.join(', '),
      newValue: b.children.join(', '),
    });
  }

  // Style changes
  diffStyleMaps(a.styles, b.styles, changes);

  // Intent change
  if (a.intent !== b.intent) {
    changes.push({
      property: 'intent',
      category: 'attribute',
      oldValue: a.intent,
      newValue: b.intent,
    });
  }

  // Component props
  if (a.componentName !== b.componentName) {
    changes.push({
      property: 'componentName',
      category: 'attribute',
      oldValue: a.componentName ?? '',
      newValue: b.componentName ?? '',
    });
  }

  return changes;
}

/** Diff two style maps and append changes */
function diffStyleMaps(a: StyleMap, b: StyleMap, changes: PropertyChange[]): void {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    const valA = a[key];
    const valB = b[key];
    if (valA !== valB) {
      changes.push({
        property: key,
        category: 'style',
        oldValue: valA ?? '(unset)',
        newValue: valB ?? '(unset)',
      });
    }
  }
}

/** Format a diff result for terminal output */
function formatDiff(diff: Z10Diff): string {
  const lines: string[] = [];

  lines.push(`Diff: ${diff.ref1} → ${diff.ref2}`);
  lines.push('');

  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && diff.tokenChanges.length === 0) {
    lines.push('No changes detected.');
    return lines.join('\n');
  }

  // Token changes
  if (diff.tokenChanges.length > 0) {
    lines.push('Token Changes:');
    for (const tc of diff.tokenChanges) {
      if (!tc.oldValue) {
        lines.push(`  + ${tc.property}: ${tc.newValue}`);
      } else if (!tc.newValue) {
        lines.push(`  - ${tc.property}: ${tc.oldValue}`);
      } else {
        lines.push(`  ~ ${tc.property}: ${tc.oldValue} → ${tc.newValue}`);
      }
    }
    lines.push('');
  }

  // Added nodes
  if (diff.added.length > 0) {
    lines.push(`Added Nodes (${diff.added.length}):`);
    for (const n of diff.added) {
      lines.push(`  + ${n.id}`);
    }
    lines.push('');
  }

  // Removed nodes
  if (diff.removed.length > 0) {
    lines.push(`Removed Nodes (${diff.removed.length}):`);
    for (const n of diff.removed) {
      lines.push(`  - ${n.id}`);
    }
    lines.push('');
  }

  // Modified nodes
  if (diff.modified.length > 0) {
    lines.push(`Modified Nodes (${diff.modified.length}):`);
    for (const n of diff.modified) {
      lines.push(`  ~ ${n.id}`);
      if (n.changes) {
        for (const c of n.changes) {
          lines.push(`    ${c.category}: ${c.property}: ${c.oldValue ?? '(unset)'} → ${c.newValue ?? '(unset)'}`);
        }
      }
    }
    lines.push('');
  }

  // Summary
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  if (diff.modified.length) parts.push(`${diff.modified.length} modified`);
  if (diff.tokenChanges.length) parts.push(`${diff.tokenChanges.length} token changes`);
  lines.push(`Summary: ${parts.join(', ')}`);

  return lines.join('\n');
}

export async function cmdDiff(args: string[]): Promise<void> {
  await ensureGitRepo();

  // Parse ref range: "ref1..ref2" or two separate args
  let ref1: string;
  let ref2: string;

  const rangeArg = args[0];
  if (!rangeArg) {
    console.error('Usage: z10 diff <ref1>..<ref2> [file.z10.html]');
    console.error('       z10 diff HEAD~1..HEAD');
    console.error('       z10 diff main..z10/dark-mode');
    process.exit(1);
  }

  if (rangeArg.includes('..')) {
    const parts = rangeArg.split('..');
    ref1 = parts[0]!;
    ref2 = parts[1]!;
  } else {
    ref1 = rangeArg;
    ref2 = args[1] ?? 'HEAD';
  }

  // Find .z10.html files that differ between the refs
  const filePath = args.find(a => a.endsWith('.z10.html'));
  let z10Files: string[];

  if (filePath) {
    z10Files = [filePath];
  } else {
    const diffOutput = await git('diff', '--name-only', `${ref1}...${ref2}`);
    z10Files = diffOutput.split('\n').filter(f => f.endsWith('.z10.html'));
  }

  if (z10Files.length === 0) {
    console.log('No .z10.html files changed between these refs.');
    return;
  }

  for (const file of z10Files) {
    console.log(`\n=== ${file} ===\n`);

    // Get file content at each ref
    let htmlA: string;
    let htmlB: string;
    try {
      htmlA = await git('show', `${ref1}:${file}`);
    } catch {
      htmlA = '';  // File didn't exist at ref1
    }
    try {
      htmlB = await git('show', `${ref2}:${file}`);
    } catch {
      htmlB = '';  // File doesn't exist at ref2
    }

    if (!htmlA && !htmlB) {
      console.log('  File not found at either ref.');
      continue;
    }

    if (!htmlA) {
      console.log(`  New file at ${ref2}`);
      continue;
    }

    if (!htmlB) {
      console.log(`  Deleted at ${ref2}`);
      continue;
    }

    // Parse both versions and compute semantic diff
    const docA = parseZ10Html(htmlA);
    const docB = parseZ10Html(htmlB);
    const rawDiff = diffDocuments(docA, docB);

    const summary = [
      rawDiff.added.length && `${rawDiff.added.length} added`,
      rawDiff.removed.length && `${rawDiff.removed.length} removed`,
      rawDiff.modified.length && `${rawDiff.modified.length} modified`,
      rawDiff.tokenChanges.length && `${rawDiff.tokenChanges.length} token changes`,
    ].filter(Boolean).join(', ') || 'No changes';

    const fullDiff: Z10Diff = {
      ...rawDiff,
      ref1,
      ref2,
      summary,
    };

    console.log(formatDiff(fullDiff));
  }
}

// ---------------------------------------------------------------------------
// z10 merge
// ---------------------------------------------------------------------------

export async function cmdMerge(args: string[]): Promise<void> {
  await ensureGitRepo();

  const sourceBranch = args[0];
  if (!sourceBranch) {
    console.error('Usage: z10 merge <branch> [--into <target>]');
    process.exit(1);
  }

  // Resolve branch name (add z10/ prefix if not already present)
  const resolvedSource = sourceBranch.startsWith('z10/') ? sourceBranch : `z10/${sourceBranch}`;

  // Check --into flag
  const intoIdx = args.indexOf('--into');
  const targetBranch = intoIdx !== -1 ? args[intoIdx + 1] : undefined;

  // Switch to target if specified
  if (targetBranch) {
    await git('checkout', targetBranch);
  }

  const currentBranch = await getCurrentBranch();
  console.log(`Merging ${resolvedSource} into ${currentBranch}...`);

  try {
    const result = await git('merge', resolvedSource, '--no-ff', '-m', `Merge design branch: ${resolvedSource}`);
    console.log(result || 'Merge successful.');

    // Check for .z10.html files in the merge
    const mergedFiles = await git('diff', '--name-only', 'HEAD~1..HEAD');
    const z10Files = mergedFiles.split('\n').filter(f => f.endsWith('.z10.html'));
    if (z10Files.length > 0) {
      console.log(`\nDesign files updated: ${z10Files.join(', ')}`);
      console.log('Run "z10 diff HEAD~1..HEAD" to see the semantic diff.');
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message.includes('CONFLICT')) {
      console.error('\nMerge conflict detected in design files!');
      console.error('Resolve conflicts, then run:');
      console.error('  git add <file>');
      console.error('  git commit');
      console.error('\nTo abort: git merge --abort');
    } else {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// z10 sync (foundation)
// ---------------------------------------------------------------------------

/** Classification of a detected change from code → design */
export type ChangeClassification = 'design-intent' | 'code-intent' | 'ambiguous';

/** A detected change between code and design */
export interface SyncChange {
  nodeId: NodeId;
  classification: ChangeClassification;
  property: string;
  designValue?: string;
  codeValue?: string;
  description: string;
}

/** Result of a sync operation */
export interface SyncResult {
  designFile: string;
  changes: SyncChange[];
  designIntent: SyncChange[];
  codeIntent: SyncChange[];
  ambiguous: SyncChange[];
}

export async function cmdSync(args: string[]): Promise<void> {
  await ensureGitRepo();

  // Parse flags
  const sourceIdx = args.indexOf('--source');
  const designIdx = args.indexOf('--design');

  const sourceDir = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const designFile = designIdx !== -1 ? args[designIdx + 1] : undefined;

  if (!designFile) {
    // Try to find a .z10.html file in the current directory
    console.error('Usage: z10 sync --design <file.z10.html> [--source <dir>]');
    console.error('');
    console.error('The sync command compares the design file against the current');
    console.error('Git state and reports what has changed.');
    console.error('');
    console.error('Example: z10 sync --design app.z10.html --source ./src');
    process.exit(1);
  }

  const resolvedDesign = resolve(designFile);

  // Read the current design file
  let html: string;
  try {
    html = await readFile(resolvedDesign, 'utf-8');
  } catch {
    console.error(`Design file not found: ${resolvedDesign}`);
    process.exit(1);
  }

  const doc = parseZ10Html(html);

  // Check if the design file has uncommitted changes
  const status = await git('status', '--porcelain', '--', resolvedDesign);
  const hasUncommitted = status.length > 0;

  // Get last committed version for comparison
  let lastCommittedHtml: string | null = null;
  try {
    lastCommittedHtml = await git('show', `HEAD:${designFile}`);
  } catch {
    // File is new / not yet committed
  }

  console.log(`Sync: ${designFile}`);
  console.log(`  Nodes: ${doc.nodes.size}`);
  console.log(`  Pages: ${doc.pages.map(p => p.name).join(', ')}`);
  console.log(`  Components: ${Array.from(doc.components.keys()).join(', ') || '(none)'}`);
  console.log(`  Uncommitted changes: ${hasUncommitted ? 'yes' : 'no'}`);

  if (lastCommittedHtml) {
    const lastDoc = parseZ10Html(lastCommittedHtml);
    const rawDiff = diffDocuments(lastDoc, doc);

    if (rawDiff.added.length || rawDiff.removed.length || rawDiff.modified.length || rawDiff.tokenChanges.length) {
      console.log('\nChanges since last commit:');
      if (rawDiff.added.length) console.log(`  + ${rawDiff.added.length} nodes added`);
      if (rawDiff.removed.length) console.log(`  - ${rawDiff.removed.length} nodes removed`);
      if (rawDiff.modified.length) console.log(`  ~ ${rawDiff.modified.length} nodes modified`);
      if (rawDiff.tokenChanges.length) console.log(`  ~ ${rawDiff.tokenChanges.length} token changes`);
    } else {
      console.log('\nNo changes since last commit.');
    }
  } else {
    console.log('\nFile is not yet committed to Git.');
  }

  if (sourceDir) {
    console.log(`\nSource directory: ${resolve(sourceDir)}`);
    console.log('Note: Full reconciliation pipeline (PRD Section 3.3) is not yet implemented.');
    console.log('Currently, z10 sync reports design file status and diff against last commit.');
  }
}
