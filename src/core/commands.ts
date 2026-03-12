import type {
  Z10Document,
  Z10Command,
  CommandResult,
  CommandSuccess,
  CommandError,
  BatchResult,
  NodeCommand,
  TextCommand,
  InstanceCommand,
  RepeatCommand,
  StyleCommand,
  MoveCommand,
  RemoveCommand,
  ComponentCommand,
  TokensCommand,
  BatchCommand,
  AttrCommand,
  WriteHtmlCommand,
  PageCommand,
  NodeId,
} from './types.js';

import { resolveFakerProps } from '../runtime/faker.js';

import {
  createNode,
  addNode,
  addPage,
  removeNode,
  moveNode,
  updateStyles,
  updateAttributes,
  setComponent,
  setTokens,
  getNode,
  canAgentEdit,
  parseInlineStyle,
} from './document.js';

// ---------------------------------------------------------------------------
// Command Executor
// ---------------------------------------------------------------------------

function success(id?: NodeId, message?: string): CommandSuccess {
  return { ok: true, id, message };
}

function error(
  code: CommandError['code'],
  message: string,
  command: Z10Command,
  suggestion?: string,
): CommandError {
  return { ok: false, code, message, command, suggestion };
}

/** Execute a single z10 command against a document */
export function executeCommand(doc: Z10Document, cmd: Z10Command): CommandResult {
  switch (cmd.type) {
    case 'node': return execNode(doc, cmd);
    case 'text': return execText(doc, cmd);
    case 'instance': return execInstance(doc, cmd);
    case 'repeat': return execRepeat(doc, cmd);
    case 'style': return execStyle(doc, cmd);
    case 'move': return execMove(doc, cmd);
    case 'remove': return execRemove(doc, cmd);
    case 'component': return execComponent(doc, cmd);
    case 'tokens': return execTokens(doc, cmd);
    case 'batch': return execBatch(doc, cmd);
    case 'attr': return execAttr(doc, cmd);
    case 'write_html': return execWriteHtml(doc, cmd);
    case 'page': return execPage(doc, cmd);
    default:
      return error('INVALID_COMMAND', `Unknown command type`, cmd as Z10Command);
  }
}

// ---------------------------------------------------------------------------
// Individual Command Executors
// ---------------------------------------------------------------------------

function execNode(doc: Z10Document, cmd: NodeCommand): CommandResult {
  if (doc.nodes.has(cmd.id)) {
    return error('NODE_EXISTS', `NODE_EXISTS: ${cmd.id}. Use z10.style to update.`, cmd,
      `Use z10.style("${cmd.id}", {...}) to update existing node.`);
  }
  if (!doc.nodes.has(cmd.parent)) {
    return error('PARENT_NOT_FOUND', `PARENT_NOT_FOUND: ${cmd.parent}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.parent)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit under node: ${cmd.parent}`, cmd);
  }

  const node = createNode({
    id: cmd.id,
    tag: cmd.tag,
    parent: cmd.parent,
    style: cmd.style,
    intent: cmd.intent,
    editor: 'agent',
    attributes: cmd.attributes,
  });
  addNode(doc, node);
  return success(cmd.id);
}

function execText(doc: Z10Document, cmd: TextCommand): CommandResult {
  if (doc.nodes.has(cmd.id)) {
    return error('NODE_EXISTS', `NODE_EXISTS: ${cmd.id}`, cmd);
  }
  if (!doc.nodes.has(cmd.parent)) {
    return error('PARENT_NOT_FOUND', `PARENT_NOT_FOUND: ${cmd.parent}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.parent)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit under node: ${cmd.parent}`, cmd);
  }

  const node = createNode({
    id: cmd.id,
    tag: 'span',
    parent: cmd.parent,
    style: cmd.style,
    textContent: cmd.content,
    intent: 'content',
    editor: 'agent',
  });
  addNode(doc, node);
  return success(cmd.id);
}

function execInstance(doc: Z10Document, cmd: InstanceCommand): CommandResult {
  if (doc.nodes.has(cmd.id)) {
    return error('NODE_EXISTS', `NODE_EXISTS: ${cmd.id}`, cmd);
  }
  if (!doc.nodes.has(cmd.parent)) {
    return error('PARENT_NOT_FOUND', `PARENT_NOT_FOUND: ${cmd.parent}`, cmd);
  }
  if (!doc.components.has(cmd.component)) {
    return error('COMPONENT_NOT_FOUND', `COMPONENT_NOT_FOUND: ${cmd.component}`, cmd,
      `Define the component first with z10.component("${cmd.component}", {...})`);
  }
  if (!canAgentEdit(doc, cmd.parent)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit under node: ${cmd.parent}`, cmd);
  }

  const node = createNode({
    id: cmd.id,
    tag: 'div',
    parent: cmd.parent,
    componentName: cmd.component,
    componentProps: cmd.props,
    intent: 'content',
    editor: 'agent',
  });
  addNode(doc, node);
  return success(cmd.id);
}

function execRepeat(doc: Z10Document, cmd: RepeatCommand): CommandResult {
  if (!doc.nodes.has(cmd.parent)) {
    return error('PARENT_NOT_FOUND', `PARENT_NOT_FOUND: ${cmd.parent}`, cmd);
  }
  if (!doc.components.has(cmd.component)) {
    return error('COMPONENT_NOT_FOUND', `COMPONENT_NOT_FOUND: ${cmd.component}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.parent)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit under node: ${cmd.parent}`, cmd);
  }

  // Create N instances with generated IDs
  const createdIds: NodeId[] = [];
  for (let i = 0; i < cmd.count; i++) {
    const instanceId = `${cmd.id}_${i}`;
    if (doc.nodes.has(instanceId)) continue;

    // Resolve faker props using the seeded faker module
    const resolvedProps = cmd.props
      ? resolveFakerProps(cmd.props, cmd.id, i)
      : {};

    const node = createNode({
      id: instanceId,
      tag: 'div',
      parent: cmd.parent,
      componentName: cmd.component,
      componentProps: resolvedProps,
      intent: 'content',
      editor: 'agent',
    });
    addNode(doc, node);
    createdIds.push(instanceId);
  }

  return success(cmd.id, `Created ${createdIds.length} instances`);
}

function execStyle(doc: Z10Document, cmd: StyleCommand): CommandResult {
  if (!doc.nodes.has(cmd.id)) {
    return error('NODE_NOT_FOUND', `NODE_NOT_FOUND: ${cmd.id}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.id)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit node: ${cmd.id}`, cmd);
  }

  updateStyles(doc, cmd.id, cmd.props);
  return success(cmd.id);
}

function execMove(doc: Z10Document, cmd: MoveCommand): CommandResult {
  if (!doc.nodes.has(cmd.id)) {
    return error('NODE_NOT_FOUND', `NODE_NOT_FOUND: ${cmd.id}`, cmd);
  }
  if (!doc.nodes.has(cmd.parent)) {
    return error('PARENT_NOT_FOUND', `PARENT_NOT_FOUND: ${cmd.parent}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.id)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit node: ${cmd.id}`, cmd);
  }

  moveNode(doc, cmd.id, cmd.parent, cmd.index);
  return success(cmd.id);
}

function execRemove(doc: Z10Document, cmd: RemoveCommand): CommandResult {
  if (!doc.nodes.has(cmd.id)) {
    return error('NODE_NOT_FOUND', `NODE_NOT_FOUND: ${cmd.id}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.id)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit node: ${cmd.id}`, cmd);
  }

  removeNode(doc, cmd.id);
  return success(cmd.id);
}

function execComponent(doc: Z10Document, cmd: ComponentCommand): CommandResult {
  setComponent(doc, { name: cmd.name, ...cmd.schema });
  return success(undefined, `Component "${cmd.name}" registered`);
}

function execTokens(doc: Z10Document, cmd: TokensCommand): CommandResult {
  setTokens(doc, cmd.collection, cmd.vars);
  return success(undefined, `${Object.keys(cmd.vars).length} tokens set in "${cmd.collection}"`);
}

function execBatch(doc: Z10Document, cmd: BatchCommand): CommandResult {
  const isStrict = cmd.mode === 'strict';
  const isUpsert = cmd.mode === 'upsert';
  const results: CommandResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const subCmd of cmd.commands) {
    let resolvedCmd = subCmd;

    // In upsert mode, convert node/text/instance creation to style updates if node exists
    if (isUpsert && ('id' in subCmd) && doc.nodes.has((subCmd as { id: NodeId }).id)) {
      if (subCmd.type === 'node' || subCmd.type === 'text' || subCmd.type === 'instance') {
        // Convert to style update
        const style = 'style' in subCmd && typeof subCmd.style === 'string'
          ? parseInlineStyle(subCmd.style)
          : {};
        resolvedCmd = { type: 'style', id: (subCmd as { id: NodeId }).id, props: style };
      }
    }

    const result = executeCommand(doc, resolvedCmd);
    results.push(result);

    if (result.ok) {
      succeeded++;
    } else {
      failed++;
      if (isStrict) {
        // Stop execution on first error
        return {
          ok: false,
          code: 'INVALID_COMMAND',
          message: `Batch failed in strict mode at command ${results.length}: ${result.message}`,
          command: cmd,
        };
      }
    }
  }

  if (failed === 0) {
    return success(undefined, `Batch: ${succeeded} succeeded, ${failed} failed`);
  }
  return error('INVALID_COMMAND', `Batch: ${succeeded} succeeded, ${failed} failed`, cmd);
}

function execAttr(doc: Z10Document, cmd: AttrCommand): CommandResult {
  if (!doc.nodes.has(cmd.id)) {
    return error('NODE_NOT_FOUND', `NODE_NOT_FOUND: ${cmd.id}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.id)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit node: ${cmd.id}`, cmd);
  }

  updateAttributes(doc, cmd.id, cmd.attributes);
  return success(cmd.id);
}

function execWriteHtml(doc: Z10Document, cmd: WriteHtmlCommand): CommandResult {
  if (!doc.nodes.has(cmd.id)) {
    return error('NODE_NOT_FOUND', `NODE_NOT_FOUND: ${cmd.id}`, cmd);
  }
  if (!canAgentEdit(doc, cmd.id)) {
    return error('GOVERNANCE_DENIED', `Agent cannot edit node: ${cmd.id}`, cmd);
  }

  // Store raw HTML as a special attribute — actual HTML injection happens at render time
  const node = getNode(doc, cmd.id)!;
  node.attributes['data-z10-raw-html'] = cmd.html;
  return success(cmd.id);
}

function execPage(doc: Z10Document, cmd: PageCommand): CommandResult {
  // Check for duplicate page name
  if (doc.pages.some(p => p.name === cmd.name)) {
    return error('INVALID_COMMAND', `Page already exists: ${cmd.name}`, cmd);
  }

  const rootId = cmd.rootId ?? `page_${doc.pages.length + 1}_root`;

  // Don't create root node if it already exists
  if (doc.nodes.has(rootId)) {
    return error('NODE_EXISTS', `NODE_EXISTS: ${rootId}`, cmd);
  }

  const rootNode = createNode({
    id: rootId,
    tag: 'div',
    parent: null,
    intent: 'layout',
    editor: 'agent',
    style: 'width: 1440px; min-height: 900px; background: #ffffff; position: relative;',
  });
  addNode(doc, rootNode);
  addPage(doc, { name: cmd.name, rootNodeId: rootId, mode: cmd.mode ?? doc.config.defaultMode });

  return success(rootId, `Page "${cmd.name}" created with root node "${rootId}"`);
}
