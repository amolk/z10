import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDocument,
  createNode,
  addNode,
  addPage,
  setComponent,
  setTokens,
} from '../../src/core/index.js';
import {
  handleReadTool,
  handleDomTool,
  handleUtilityTool,
  READ_TOOLS,
  DOM_TOOLS,
  UTILITY_TOOLS,
} from '../../src/mcp/tools.js';
import type { Z10Document } from '../../src/core/types.js';
import { LocalProxy } from '../../src/dom/proxy.js';

describe('MCP Tools', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = createDocument({ name: 'Test Project' });

    // Set up a basic document for testing
    const root = createNode({ id: 'page_root', tag: 'div', parent: null, intent: 'layout' });
    addNode(doc, root);
    const header = createNode({ id: 'header', tag: 'header', parent: 'page_root', style: 'display: flex; padding: 16px', intent: 'layout' });
    addNode(doc, header);
    const title = createNode({ id: 'title', tag: 'h1', parent: 'header', textContent: 'Hello World' });
    addNode(doc, title);

    addPage(doc, { name: 'Home', rootNodeId: 'page_root', mode: 'light' });

    setTokens(doc, 'primitives', { '--blue-500': '#3b82f6', '--gray-100': '#f3f4f6' });
    setTokens(doc, 'semantic', { '--primary': 'var(--blue-500)' });

    setComponent(doc, {
      name: 'Button',
      props: [{ name: 'variant', type: 'enum', options: ['primary', 'secondary'] }],
      variants: [{ name: 'primary', props: { variant: 'primary' } }],
      styles: '.btn { padding: 8px 16px; }',
      template: '<button class="btn"><slot /></button>',
    });
  });

  describe('Tool Definitions', () => {
    it('has 7 read tools', () => {
      expect(READ_TOOLS.length).toBe(7);
    });

    it('has 3 DOM tools', () => {
      expect(DOM_TOOLS.length).toBe(3);
      const names = DOM_TOOLS.map(t => t.name);
      expect(names).toContain('submit_code');
      expect(names).toContain('get_subtree');
      expect(names).toContain('refresh_subtree');
    });

    it('all tools have name, description, and inputSchema', () => {
      for (const tool of [...READ_TOOLS, ...DOM_TOOLS, ...UTILITY_TOOLS]) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeTruthy();
      }
    });
  });

  describe('Read Tools', () => {
    it('get_project_summary returns overview', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_project_summary', {}));
      expect(result.config.name).toBe('Test Project');
      expect(result.componentCount).toBe(1);
      expect(result.components).toEqual(['Button']);
      expect(result.tokens.primitives).toBe(2);
      expect(result.tokens.semantic).toBe(1);
      expect(result.pages.length).toBe(1);
      expect(result.nodeCount).toBe(3);
    });

    it('get_component_props returns schema', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_component_props', { name: 'Button' }));
      expect(result.name).toBe('Button');
      expect(result.props.length).toBe(1);
      expect(result.props[0].name).toBe('variant');
    });

    it('get_component_props errors on unknown', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_component_props', { name: 'Unknown' }));
      expect(result.error).toContain('not found');
    });

    it('get_node_info returns node details', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_node_info', { id: 'header' }));
      expect(result.id).toBe('header');
      expect(result.tag).toBe('header');
      expect(result.styles['display']).toBe('flex');
      expect(result.children).toEqual(['title']);
    });

    it('get_node_info errors on unknown', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_node_info', { id: 'missing' }));
      expect(result.error).toContain('not found');
    });

    it('get_tree returns compact tree', () => {
      const result = handleReadTool(doc, 'get_tree', {});
      expect(result).toContain('Home');
      expect(result).toContain('#page_root');
      expect(result).toContain('#header');
      expect(result).toContain('#title');
    });

    it('get_tree with specific node', () => {
      const result = handleReadTool(doc, 'get_tree', { id: 'header' });
      expect(result).toContain('#header');
      expect(result).toContain('#title');
      expect(result).not.toContain('#page_root');
    });

    it('get_styles returns CSS', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_styles', { id: 'header' }));
      expect(result.styles['display']).toBe('flex');
      expect(result.styles['padding']).toBe('16px');
      expect(result.styleString).toContain('display: flex');
    });

    it('get_tokens returns all tokens', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_tokens', {}));
      expect(result.primitives['--blue-500']).toBe('#3b82f6');
      expect(result.semantic['--primary']).toBe('var(--blue-500)');
    });

    it('get_tokens filters by collection', () => {
      const result = JSON.parse(handleReadTool(doc, 'get_tokens', { collection: 'primitives' }));
      expect(result.primitives).toBeDefined();
      expect(result.semantic).toBeUndefined();
    });

    it('get_guide returns help text', () => {
      const result = handleReadTool(doc, 'get_guide', {});
      expect(result).toContain('3 DOM tools');
    });

    it('get_guide with specific topic', () => {
      const result = handleReadTool(doc, 'get_guide', { topic: 'styles' });
      expect(result).toContain('style');
    });
  });

  describe('DOM Tools', () => {
    let proxy: LocalProxy;

    beforeEach(() => {
      proxy = new LocalProxy();
      proxy.loadDocument('<section data-z10-id="main"><p data-z10-id="p1">Hello</p></section>');
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('get_subtree returns HTML and ticketId', async () => {
      const result = JSON.parse(await handleDomTool(proxy, 'get_subtree', {
        selector: '[data-z10-id="main"]',
      }));
      expect(result.html).toContain('data-z10-id="main"');
      expect(result.ticketId).toBeTruthy();
    });

    it('get_subtree errors on missing selector', async () => {
      const result = JSON.parse(await handleDomTool(proxy, 'get_subtree', {}));
      expect(result.error).toContain('selector');
    });

    it('get_subtree errors on non-existent selector', async () => {
      const result = JSON.parse(await handleDomTool(proxy, 'get_subtree', {
        selector: '[data-z10-id="nonexistent"]',
      }));
      expect(result.error).toContain('not found');
    });

    it('submit_code commits a valid mutation', async () => {
      // First get a ticket
      const subtree = JSON.parse(await handleDomTool(proxy, 'get_subtree', {
        selector: '[data-z10-id="main"]',
      }));

      const result = JSON.parse(await handleDomTool(proxy, 'submit_code', {
        code: 'document.querySelector("[data-z10-id=\\"p1\\"]").textContent = "Updated";',
        ticketId: subtree.ticketId,
      }));
      expect(result.status).toBe('committed');
      expect(result.txId).toBeGreaterThan(0);
      expect(result.html).toContain('Updated');
      expect(result.newTicketId).toBeTruthy();
    });

    it('submit_code errors on missing params', async () => {
      const result = JSON.parse(await handleDomTool(proxy, 'submit_code', { code: 'x' }));
      expect(result.error).toContain('Missing');
    });

    it('submit_code errors on invalid ticket', async () => {
      const result = JSON.parse(await handleDomTool(proxy, 'submit_code', {
        code: 'x', ticketId: 'invalid-ticket',
      }));
      expect(result.error).toContain('Invalid');
    });

    it('refresh_subtree reports unchanged', async () => {
      const subtree = JSON.parse(await handleDomTool(proxy, 'get_subtree', {
        selector: '[data-z10-id="main"]',
      }));

      const result = JSON.parse(await handleDomTool(proxy, 'refresh_subtree', {
        ticketId: subtree.ticketId,
      }));
      expect(result.changed).toBe(false);
    });

    it('refresh_subtree errors on missing ticketId', async () => {
      const result = JSON.parse(await handleDomTool(proxy, 'refresh_subtree', {}));
      expect(result.error).toContain('ticketId');
    });

    it('returns error for unknown DOM tool', async () => {
      const result = JSON.parse(await handleDomTool(proxy, 'unknown_tool', {}));
      expect(result.error).toContain('Unknown');
    });
  });

  describe('Utility Tools', () => {
    it('has find_placement in UTILITY_TOOLS', () => {
      const tool = UTILITY_TOOLS.find(t => t.name === 'find_placement');
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('canvas position');
    });

    it('find_placement returns placement for page root', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'find_placement', {}));
      expect(result.parent).toBe('page_root');
      expect(result.insertIndex).toBe(1); // header is already there
      expect(result.siblingCount).toBe(1);
      expect(result.layout).toBeDefined();
      expect(result.suggestion).toBeDefined();
    });

    it('find_placement accepts explicit parent', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'find_placement', { parent: 'header' }));
      expect(result.parent).toBe('header');
      expect(result.layout).toBe('flex-row'); // header has display: flex
    });

    it('find_placement errors on unknown parent', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'find_placement', { parent: 'nonexistent' }));
      expect(result.error).toContain('PARENT_NOT_FOUND');
    });

    it('find_placement handles near node', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'find_placement', { parent: 'header', near: 'title' }));
      expect(result.parent).toBe('header');
      expect(result.insertIndex).toBe(1); // after title (index 0)
      expect(result.suggestion).toContain('title');
    });

    it('find_placement handles before position', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'find_placement', { parent: 'header', near: 'title', position: 'before' }));
      expect(result.insertIndex).toBe(0); // before title
    });

    it('find_placement suggests styles with size', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'find_placement', { size: { width: 200, height: 100 } }));
      expect(result.recommendedStyle).toBeDefined();
      expect(result.recommendedStyle.width).toBe('200px');
      expect(result.recommendedStyle.height).toBe('100px');
    });

    it('find_placement handles inside position', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'find_placement', { near: 'header', position: 'inside' }));
      expect(result.parent).toBe('header');
      expect(result.suggestion).toContain('inside');
    });

    it('reconcile reports healthy document', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'reconcile', {}));
      expect(result.status).toBe('healthy');
      expect(result.summary.totalNodes).toBe(3); // page_root, header, title
      expect(result.summary.totalPages).toBe(1);
      expect(result.summary.totalComponents).toBe(1); // Button
      expect(result.issues).toEqual([]);
    });

    it('reconcile reports component usage', () => {
      // Add a Button instance
      const btnNode = createNode({
        id: 'btn1', tag: 'div', parent: 'header',
        componentName: 'Button', componentProps: { variant: 'primary' },
      });
      addNode(doc, btnNode);

      const result = JSON.parse(handleUtilityTool(doc, 'reconcile', {}));
      expect(result.components.usage.Button).toBe(1);
      expect(result.components.unusedDefinitions).toEqual([]);
    });

    it('reconcile detects unused components', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'reconcile', {}));
      // Button is defined but not instantiated in the base test doc
      expect(result.components.unusedDefinitions).toContain('Button');
    });

    it('reconcile reports intent classification', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'reconcile', {}));
      expect(result.classification.byIntent).toBeDefined();
      expect(result.classification.byIntent.layout).toBeGreaterThan(0);
    });

    it('reconcile detects token references', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'reconcile', {}));
      expect(result.tokens).toBeDefined();
      expect(result.summary.totalTokens).toBeGreaterThan(0);
    });

    it('reconcile includes source note when source provided', () => {
      const result = JSON.parse(handleUtilityTool(doc, 'reconcile', { source: './src' }));
      expect(result.reconciliation).toBeDefined();
      expect(result.reconciliation.sourceDir).toBe('./src');
    });
  });
});
