import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDocument,
  createNode,
  addNode,
  setComponent,
  getNode,
  executeCommand,
} from '../../src/core/index.js';
import type {
  Z10Document,
  Z10Command,
  NodeCommand,
  TextCommand,
  InstanceCommand,
  StyleCommand,
  MoveCommand,
  RemoveCommand,
  ComponentCommand,
  TokensCommand,
  BatchCommand,
  AttrCommand,
  RepeatCommand,
  ComponentSchema,
} from '../../src/core/types.js';

describe('Command Executor', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = createDocument({ name: 'Test' });
    // Add a root node for commands that need a parent
    const root = createNode({ id: 'root', tag: 'div', parent: null, intent: 'layout' });
    addNode(doc, root);
  });

  describe('z10.node', () => {
    it('creates a container node', () => {
      const cmd: NodeCommand = {
        type: 'node', id: 'header', tag: 'header', parent: 'root',
        style: 'display: flex; padding: 16px',
        intent: 'layout',
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);

      const node = getNode(doc, 'header');
      expect(node?.tag).toBe('header');
      expect(node?.styles['display']).toBe('flex');
      expect(node?.parent).toBe('root');
    });

    it('errors on duplicate ID', () => {
      executeCommand(doc, { type: 'node', id: 'x', tag: 'div', parent: 'root' });
      const result = executeCommand(doc, { type: 'node', id: 'x', tag: 'div', parent: 'root' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NODE_EXISTS');
      }
    });

    it('errors on missing parent', () => {
      const result = executeCommand(doc, { type: 'node', id: 'x', tag: 'div', parent: 'missing' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('PARENT_NOT_FOUND');
      }
    });
  });

  describe('z10.text', () => {
    it('creates a text node', () => {
      const cmd: TextCommand = {
        type: 'text', id: 'logo', parent: 'root',
        content: 'Zero-10',
        style: 'font-size: 24px; font-weight: bold',
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);

      const node = getNode(doc, 'logo');
      expect(node?.textContent).toBe('Zero-10');
      expect(node?.tag).toBe('span');
    });
  });

  describe('z10.instance', () => {
    beforeEach(() => {
      // Register a Button component
      const schema: ComponentSchema = {
        name: 'Button',
        props: [{ name: 'variant', type: 'enum', options: ['primary', 'secondary'] }],
        variants: [],
        styles: '',
        template: '<button></button>',
      };
      setComponent(doc, schema);
    });

    it('creates a component instance', () => {
      const cmd: InstanceCommand = {
        type: 'instance', id: 'save_btn', component: 'Button',
        parent: 'root', props: { variant: 'primary' },
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);

      const node = getNode(doc, 'save_btn');
      expect(node?.componentName).toBe('Button');
      expect(node?.componentProps?.variant).toBe('primary');
    });

    it('errors on unknown component', () => {
      const result = executeCommand(doc, {
        type: 'instance', id: 'x', component: 'Unknown', parent: 'root',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('COMPONENT_NOT_FOUND');
      }
    });
  });

  describe('z10.style', () => {
    it('merges styles on existing node', () => {
      executeCommand(doc, { type: 'node', id: 'box', tag: 'div', parent: 'root', style: 'color: red' });
      const result = executeCommand(doc, { type: 'style', id: 'box', props: { color: 'blue', margin: '4px' } });
      expect(result.ok).toBe(true);

      const node = getNode(doc, 'box');
      expect(node?.styles['color']).toBe('blue');
      expect(node?.styles['margin']).toBe('4px');
    });

    it('errors on non-existent node', () => {
      const result = executeCommand(doc, { type: 'style', id: 'missing', props: { color: 'red' } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NODE_NOT_FOUND');
      }
    });
  });

  describe('z10.move', () => {
    it('moves a node to a new parent', () => {
      executeCommand(doc, { type: 'node', id: 'a', tag: 'div', parent: 'root' });
      executeCommand(doc, { type: 'node', id: 'b', tag: 'div', parent: 'root' });
      executeCommand(doc, { type: 'node', id: 'child', tag: 'span', parent: 'a' });

      const result = executeCommand(doc, { type: 'move', id: 'child', parent: 'b' });
      expect(result.ok).toBe(true);
      expect(getNode(doc, 'a')?.children).toEqual([]);
      expect(getNode(doc, 'b')?.children).toEqual(['child']);
    });
  });

  describe('z10.remove', () => {
    it('removes a node and its children', () => {
      executeCommand(doc, { type: 'node', id: 'container', tag: 'div', parent: 'root' });
      executeCommand(doc, { type: 'text', id: 'label', parent: 'container', content: 'hello' });

      const result = executeCommand(doc, { type: 'remove', id: 'container' });
      expect(result.ok).toBe(true);
      expect(getNode(doc, 'container')).toBeUndefined();
      expect(getNode(doc, 'label')).toBeUndefined();
    });

    it('errors on non-existent node', () => {
      const result = executeCommand(doc, { type: 'remove', id: 'missing' });
      expect(result.ok).toBe(false);
    });
  });

  describe('z10.component', () => {
    it('registers a component', () => {
      const cmd: ComponentCommand = {
        type: 'component', name: 'Card',
        schema: {
          props: [{ name: 'title', type: 'string' }],
          variants: [],
          styles: '.card { border-radius: 8px; }',
          template: '<div class="card"><slot /></div>',
        },
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);
      expect(doc.components.has('Card')).toBe(true);
    });
  });

  describe('z10.tokens', () => {
    it('sets design tokens', () => {
      const cmd: TokensCommand = {
        type: 'tokens', collection: 'primitives',
        vars: { '--blue-500': '#3b82f6', '--blue-600': '#2563eb' },
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);
      expect(doc.tokens.primitives.size).toBe(2);
    });
  });

  describe('z10.attr', () => {
    it('sets attributes on a node', () => {
      executeCommand(doc, { type: 'node', id: 'btn', tag: 'button', parent: 'root' });
      const result = executeCommand(doc, { type: 'attr', id: 'btn', attributes: { 'aria-label': 'Save', role: 'button' } });
      expect(result.ok).toBe(true);
      expect(getNode(doc, 'btn')?.attributes['aria-label']).toBe('Save');
    });
  });

  describe('z10.repeat', () => {
    beforeEach(() => {
      setComponent(doc, {
        name: 'Card',
        props: [{ name: 'title', type: 'string' }],
        variants: [],
        styles: '',
        template: '<div class="card"></div>',
      });
    });

    it('creates multiple instances', () => {
      const cmd: RepeatCommand = {
        type: 'repeat', id: 'card', parent: 'root',
        count: 3, component: 'Card',
        props: { title: { faker: 'company.name' } },
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);
      expect(getNode(doc, 'card_0')).toBeDefined();
      expect(getNode(doc, 'card_1')).toBeDefined();
      expect(getNode(doc, 'card_2')).toBeDefined();
    });
  });

  describe('z10.batch', () => {
    it('executes multiple commands', () => {
      const cmd: BatchCommand = {
        type: 'batch',
        commands: [
          { type: 'node', id: 'a', tag: 'div', parent: 'root' },
          { type: 'node', id: 'b', tag: 'div', parent: 'root' },
          { type: 'text', id: 't', parent: 'a', content: 'hello' },
        ],
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);
      expect(doc.nodes.size).toBe(4); // root + a + b + t
    });

    it('continues on error in default mode', () => {
      const cmd: BatchCommand = {
        type: 'batch',
        commands: [
          { type: 'node', id: 'a', tag: 'div', parent: 'root' },
          { type: 'node', id: 'a', tag: 'div', parent: 'root' }, // duplicate, will fail
          { type: 'node', id: 'b', tag: 'div', parent: 'root' }, // should still succeed
        ],
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(false);
      expect(doc.nodes.has('b')).toBe(true); // continued past error
    });

    it('stops on error in strict mode', () => {
      const cmd: BatchCommand = {
        type: 'batch',
        mode: 'strict',
        commands: [
          { type: 'node', id: 'a', tag: 'div', parent: 'root' },
          { type: 'style', id: 'missing', props: {} }, // will error
          { type: 'node', id: 'b', tag: 'div', parent: 'root' }, // should not execute
        ],
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(false);
      expect(doc.nodes.has('b')).toBe(false); // stopped
    });

    it('upsert mode converts creation to update for existing nodes', () => {
      executeCommand(doc, { type: 'node', id: 'existing', tag: 'div', parent: 'root', style: 'color: red' });

      const cmd: BatchCommand = {
        type: 'batch',
        mode: 'upsert',
        commands: [
          { type: 'node', id: 'existing', tag: 'div', parent: 'root', style: 'color: blue' },
          { type: 'node', id: 'new-node', tag: 'div', parent: 'root' },
        ],
      };
      const result = executeCommand(doc, cmd);
      expect(result.ok).toBe(true);
      expect(getNode(doc, 'existing')?.styles['color']).toBe('blue');
      expect(getNode(doc, 'new-node')).toBeDefined();
    });
  });

  describe('z10.write_html', () => {
    it('stores raw HTML on a node', () => {
      executeCommand(doc, { type: 'node', id: 'container', tag: 'div', parent: 'root' });
      const result = executeCommand(doc, { type: 'write_html', id: 'container', html: '<p>Custom HTML</p>' });
      expect(result.ok).toBe(true);
      expect(getNode(doc, 'container')?.attributes['data-z10-raw-html']).toBe('<p>Custom HTML</p>');
    });
  });

  describe('Governance Enforcement', () => {
    it('blocks agent edits on scoped-edit locked nodes', () => {
      doc.config.governance = 'scoped-edit';
      const locked = createNode({ id: 'locked', tag: 'div', parent: null, agentEditable: false });
      addNode(doc, locked);

      const result = executeCommand(doc, { type: 'node', id: 'child', tag: 'span', parent: 'locked' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('GOVERNANCE_DENIED');
      }
    });
  });
});
