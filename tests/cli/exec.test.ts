/**
 * Tests for legacy exec functions — statement parsing, execution environment.
 *
 * These test the legacy functions in legacy-exec.ts which are kept
 * for MCP tool compatibility until E4 migrates them.
 */

import { describe, it, expect } from 'vitest';
import { parseStatements, createExecEnvironment, executeStatement, summarizeStatement } from '../../src/cli/legacy-exec.js';

describe('parseStatements', () => {
  it('should parse simple variable declarations', () => {
    const stmts = parseStatements('const x = 1;\nconst y = 2;');
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe('const x = 1;');
    expect(stmts[1]).toBe('const y = 2;');
  });

  it('should parse multi-line statements', () => {
    const source = `const obj = {
  a: 1,
  b: 2
};`;
    const stmts = parseStatements(source);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('const obj');
  });

  it('should parse function declarations', () => {
    const source = `function greet(name) {
  return 'Hello ' + name;
}
greet('world');`;
    const stmts = parseStatements(source);
    expect(stmts).toHaveLength(2);
  });

  it('should parse for loops', () => {
    const source = `for (let i = 0; i < 5; i++) {
  console.log(i);
}`;
    const stmts = parseStatements(source);
    expect(stmts).toHaveLength(1);
  });

  it('should parse class declarations', () => {
    const source = `class Foo extends HTMLElement {
  constructor() { super(); }
  connectedCallback() { this.render(); }
  render() { this.innerHTML = '<div>Hello</div>'; }
}`;
    const stmts = parseStatements(source);
    expect(stmts).toHaveLength(1);
  });

  it('should throw on syntax errors', () => {
    expect(() => parseStatements('const x = ;')).toThrow('Parse error');
  });

  it('should handle template literals', () => {
    const source = 'const msg = `hello ${"world"}`;';
    const stmts = parseStatements(source);
    expect(stmts).toHaveLength(1);
  });

  it('should parse arrow functions', () => {
    const source = 'const fn = (a, b) => a + b;\nfn(1, 2);';
    const stmts = parseStatements(source);
    expect(stmts).toHaveLength(2);
  });

  it('should handle empty input', () => {
    const stmts = parseStatements('');
    expect(stmts).toHaveLength(0);
  });
});

describe('createExecEnvironment', () => {
  it('should create a DOM environment', () => {
    const { context, getHtml } = createExecEnvironment();
    expect(context).toBeDefined();
    expect(getHtml()).toBe('');
  });

  it('should seed with initial HTML', () => {
    const { getHtml } = createExecEnvironment('<div id="test">Hello</div>');
    expect(getHtml()).toContain('id="test"');
    expect(getHtml()).toContain('Hello');
  });

  it('should expose document global', () => {
    const { context } = createExecEnvironment('<div id="test">Hello</div>');
    const result = executeStatement('document.getElementById("test").textContent', context);
    expect(result.success).toBe(true);
    expect(result.result).toBe('Hello');
  });

  it('should expose z10 global with setTokens', () => {
    const { context } = createExecEnvironment();
    const result = executeStatement('typeof z10.setTokens', context);
    expect(result.success).toBe(true);
    expect(result.result).toBe('function');
  });
});

describe('executeStatement', () => {
  it('should execute DOM operations', () => {
    const { context, getHtml } = createExecEnvironment();
    const r1 = executeStatement('const div = document.createElement("div");', context);
    expect(r1.success).toBe(true);

    const r2 = executeStatement('div.id = "new-node";', context);
    expect(r2.success).toBe(true);

    const r3 = executeStatement('document.body.appendChild(div);', context);
    expect(r3.success).toBe(true);

    expect(getHtml()).toContain('id="new-node"');
  });

  it('should handle errors gracefully', () => {
    const { context } = createExecEnvironment();
    const result = executeStatement('undefinedVariable.foo()', context);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should modify existing elements', () => {
    const { context, getHtml } = createExecEnvironment('<div id="box">old</div>');
    const result = executeStatement('document.getElementById("box").textContent = "new";', context);
    expect(result.success).toBe(true);
    expect(getHtml()).toContain('new');
  });

  it('should support querySelector', () => {
    const { context } = createExecEnvironment(
      '<div class="item">A</div><div class="item">B</div>'
    );
    const result = executeStatement(
      'document.querySelectorAll(".item").length',
      context
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  it('should support style manipulation', () => {
    const { context, getHtml } = createExecEnvironment('<div id="box">test</div>');
    executeStatement('document.getElementById("box").style.padding = "8px";', context);
    expect(getHtml()).toContain('padding');
  });

  it('should support setAttribute', () => {
    const { context, getHtml } = createExecEnvironment('<div id="box">test</div>');
    executeStatement('document.getElementById("box").setAttribute("data-z10-intent", "layout");', context);
    expect(getHtml()).toContain('data-z10-intent');
  });
});

describe('summarizeStatement', () => {
  it('should return short statements as-is', () => {
    expect(summarizeStatement('const x = 1;')).toBe('const x = 1;');
  });

  it('should truncate long statements', () => {
    const long = 'const x = ' + 'a'.repeat(100) + ';';
    const summary = summarizeStatement(long);
    expect(summary.length).toBeLessThanOrEqual(80);
    expect(summary).toContain('...');
  });

  it('should collapse whitespace', () => {
    expect(summarizeStatement('const x =\n  1;')).toBe('const x = 1;');
  });
});
