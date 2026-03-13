/**
 * Tests for z10 dom — compact tree view generation.
 */

import { describe, it, expect } from 'vitest';
import { compactTreeView } from '../../src/cli/dom.js';

describe('compactTreeView', () => {
  it('should render simple elements', () => {
    const html = '<div><span>Hello</span></div>';
    const tree = compactTreeView(html);
    expect(tree).toContain('div');
    expect(tree).toContain('span');
  });

  it('should show data-z10-id as #id', () => {
    const html = '<div data-z10-id="sidebar">content</div>';
    const tree = compactTreeView(html);
    expect(tree).toContain('#sidebar');
  });

  it('should show data-z10-component as [Component]', () => {
    const html = '<div data-z10-component="Button">click</div>';
    const tree = compactTreeView(html);
    expect(tree).toContain('[Button]');
  });

  it('should show data-z10-intent as (intent)', () => {
    const html = '<div data-z10-intent="layout">content</div>';
    const tree = compactTreeView(html);
    expect(tree).toContain('(layout)');
  });

  it('should show classes as .class', () => {
    const html = '<div class="card active">content</div>';
    const tree = compactTreeView(html);
    expect(tree).toContain('.card.active');
  });

  it('should indent nested elements', () => {
    const html = '<div><section><p>text</p></section></div>';
    const tree = compactTreeView(html);
    const lines = tree.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    // Each level should have more indentation
    const divLine = lines.find(l => l.includes('div'))!;
    const sectionLine = lines.find(l => l.includes('section'))!;
    expect(sectionLine.indexOf('section')).toBeGreaterThan(divLine.indexOf('div'));
  });

  it('should handle self-closing tags', () => {
    const html = '<div><br/><img src="a.png"/></div>';
    const tree = compactTreeView(html);
    expect(tree).toContain('br');
    expect(tree).toContain('img');
  });

  it('should handle empty input', () => {
    const tree = compactTreeView('');
    expect(tree).toBe('');
  });
});
