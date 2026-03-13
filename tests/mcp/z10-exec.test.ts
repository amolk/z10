/**
 * Tests for z10_exec MCP tool — batch JavaScript execution via MCP.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDocument,
  createNode,
  addNode,
  addPage,
  setTokens,
} from '../../src/core/index.js';
import { handleUtilityTool, UTILITY_TOOLS } from '../../src/mcp/tools.js';
import type { Z10Document } from '../../src/core/types.js';

describe('z10_exec MCP tool', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = createDocument({ name: 'Test Project' });
    const root = createNode({ id: 'page_root', tag: 'div', parent: null, intent: 'layout' });
    addNode(doc, root);
    const box = createNode({ id: 'box', tag: 'div', parent: 'page_root', textContent: 'Hello' });
    addNode(doc, box);
    addPage(doc, { name: 'Home', rootNodeId: 'page_root', mode: 'light' });
    setTokens(doc, 'primitives', { '--blue-500': '#3b82f6' });
  });

  it('should be registered as a utility tool', () => {
    const tool = UTILITY_TOOLS.find(t => t.name === 'z10_exec');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toContain('code');
  });

  it('should execute simple DOM operations', () => {
    const result = JSON.parse(handleUtilityTool(doc, 'z10_exec', {
      code: 'const div = document.createElement("div"); div.id = "new"; document.body.appendChild(div);',
    }));

    expect(result.success).toBe(true);
    expect(result.statementsExecuted).toBe(3);
    expect(result.checksum).toBeDefined();
    expect(result.html).toContain('id="new"');
  });

  it('should fail fast on error', () => {
    const result = JSON.parse(handleUtilityTool(doc, 'z10_exec', {
      code: 'const x = 1;\nundefinedVar.foo();\nconst y = 2;',
    }));

    expect(result.success).toBe(false);
    expect(result.statementsExecuted).toBe(2); // first + error
    expect(result.statementsTotal).toBe(3);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBeDefined();
  });

  it('should reject missing code parameter', () => {
    const result = JSON.parse(handleUtilityTool(doc, 'z10_exec', {}));
    expect(result.error).toContain('Missing');
  });

  it('should handle parse errors', () => {
    const result = JSON.parse(handleUtilityTool(doc, 'z10_exec', {
      code: 'const x = ;',
    }));
    expect(result.error).toContain('Parse error');
  });

  it('should handle empty code', () => {
    const result = JSON.parse(handleUtilityTool(doc, 'z10_exec', {
      code: '',
    }));
    expect(result.error).toBeDefined();
  });

  it('should return checksum on success', () => {
    const r1 = JSON.parse(handleUtilityTool(doc, 'z10_exec', {
      code: 'document.body.innerHTML = "<p>A</p>";',
    }));
    const r2 = JSON.parse(handleUtilityTool(doc, 'z10_exec', {
      code: 'document.body.innerHTML = "<p>B</p>";',
    }));

    expect(r1.checksum).toBeDefined();
    expect(r2.checksum).toBeDefined();
    expect(r1.checksum).not.toBe(r2.checksum);
  });

  it('should execute multi-statement code with loops', () => {
    const result = JSON.parse(handleUtilityTool(doc, 'z10_exec', {
      code: `
        for (let i = 0; i < 3; i++) {
          const el = document.createElement("span");
          el.textContent = "item-" + i;
          document.body.appendChild(el);
        }
      `,
    }));

    expect(result.success).toBe(true);
    expect(result.html).toContain('item-0');
    expect(result.html).toContain('item-2');
  });
});
