import { describe, it, expect, beforeEach } from 'vitest';
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
  handleWriteTool,
  handleUtilityTool,
  READ_TOOLS,
  WRITE_TOOLS,
  UTILITY_TOOLS,
} from '../../src/mcp/tools.js';
import type { Z10Document, ComponentSchema } from '../../src/core/types.js';

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

    it('has 12 write tools', () => {
      expect(WRITE_TOOLS.length).toBe(12);
    });

    it('all tools have name, description, and inputSchema', () => {
      for (const tool of [...READ_TOOLS, ...WRITE_TOOLS]) {
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
      expect(result).toContain('12 write commands');
    });

    it('get_guide with specific topic', () => {
      const result = handleReadTool(doc, 'get_guide', { topic: 'styles' });
      expect(result).toContain('MERGE semantics');
    });
  });

  describe('Write Tools', () => {
    it('z10_node creates a node', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_node', {
        id: 'sidebar', tag: 'aside', parent: 'page_root', style: 'width: 250px',
      }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.has('sidebar')).toBe(true);
    });

    it('z10_text creates text', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_text', {
        id: 'label', parent: 'header', content: 'Welcome',
      }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.get('label')?.textContent).toBe('Welcome');
    });

    it('z10_instance creates component instance', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_instance', {
        id: 'save_btn', component: 'Button', parent: 'header',
        props: { variant: 'primary' },
      }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.get('save_btn')?.componentName).toBe('Button');
    });

    it('z10_style updates styles', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_style', {
        id: 'header', props: { 'background': '#fff', 'padding': '24px' },
      }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.get('header')?.styles['background']).toBe('#fff');
      expect(doc.nodes.get('header')?.styles['padding']).toBe('24px');
      expect(doc.nodes.get('header')?.styles['display']).toBe('flex'); // preserved
    });

    it('z10_move moves a node', () => {
      handleWriteTool(doc, 'z10_node', { id: 'footer', tag: 'footer', parent: 'page_root' });
      const result = JSON.parse(handleWriteTool(doc, 'z10_move', {
        id: 'title', parent: 'footer',
      }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.get('title')?.parent).toBe('footer');
    });

    it('z10_remove deletes a node', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_remove', { id: 'title' }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.has('title')).toBe(false);
    });

    it('z10_component registers a component', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_component', {
        name: 'Card',
        props: [{ name: 'title', type: 'string' }],
        variants: [],
        styles: '.card { border-radius: 8px; }',
        template: '<div class="card"><slot /></div>',
      }));
      expect(result.ok).toBe(true);
      expect(doc.components.has('Card')).toBe(true);
    });

    it('z10_tokens sets tokens', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_tokens', {
        collection: 'primitives',
        vars: { '--red-500': '#ef4444' },
      }));
      expect(result.ok).toBe(true);
      expect(doc.tokens.primitives.has('--red-500')).toBe(true);
    });

    it('z10_attr sets attributes', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_attr', {
        id: 'header', attributes: { 'aria-label': 'Main header' },
      }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.get('header')?.attributes['aria-label']).toBe('Main header');
    });

    it('z10_batch executes multiple commands', () => {
      const result = JSON.parse(handleWriteTool(doc, 'z10_batch', {
        commands: [
          { type: 'node', id: 'nav', tag: 'nav', parent: 'page_root' },
          { type: 'text', id: 'link', parent: 'nav', content: 'Home' },
        ],
      }));
      expect(result.ok).toBe(true);
      expect(doc.nodes.has('nav')).toBe(true);
      expect(doc.nodes.has('link')).toBe(true);
    });

    it('write_html stores HTML', () => {
      const result = JSON.parse(handleWriteTool(doc, 'write_html', {
        id: 'header', html: '<p>Custom</p>',
      }));
      expect(result.ok).toBe(true);
    });

    it('returns error for unknown tool', () => {
      const result = JSON.parse(handleWriteTool(doc, 'unknown_tool', {}));
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
