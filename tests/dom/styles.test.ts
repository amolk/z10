import { describe, it, expect } from 'vitest';
import { parseStyleString, diffStyleProperties } from '../../src/dom/styles.js';

describe('parseStyleString', () => {
  it('parses empty string to empty map', () => {
    expect(parseStyleString('')).toEqual(new Map());
  });

  it('parses null-ish to empty map', () => {
    expect(parseStyleString(null as any)).toEqual(new Map());
    expect(parseStyleString(undefined as any)).toEqual(new Map());
  });

  it('parses single property', () => {
    const result = parseStyleString('font-size: 16px');
    expect(result.get('font-size')).toBe('16px');
    expect(result.size).toBe(1);
  });

  it('parses multiple properties', () => {
    const result = parseStyleString('font-size: 16px; color: red; margin: 0');
    expect(result.get('font-size')).toBe('16px');
    expect(result.get('color')).toBe('red');
    expect(result.get('margin')).toBe('0');
    expect(result.size).toBe(3);
  });

  it('handles trailing semicolons', () => {
    const result = parseStyleString('color: red;');
    expect(result.get('color')).toBe('red');
    expect(result.size).toBe(1);
  });

  it('handles extra whitespace', () => {
    const result = parseStyleString('  color :  red  ;  font-size :  16px  ');
    expect(result.get('color')).toBe('red');
    expect(result.get('font-size')).toBe('16px');
  });

  it('normalizes property names to lowercase', () => {
    const result = parseStyleString('Font-Size: 16px; COLOR: red');
    expect(result.get('font-size')).toBe('16px');
    expect(result.get('color')).toBe('red');
  });

  it('handles values with colons (e.g. url())', () => {
    const result = parseStyleString('background: url(https://example.com/img.png)');
    expect(result.get('background')).toBe('url(https://example.com/img.png)');
  });

  it('skips empty declarations', () => {
    const result = parseStyleString(';;;color: red;;;');
    expect(result.get('color')).toBe('red');
    expect(result.size).toBe(1);
  });
});

describe('diffStyleProperties', () => {
  it('returns empty array for identical maps', () => {
    const map = new Map([['color', 'red'], ['font-size', '16px']]);
    expect(diffStyleProperties(map, new Map(map))).toEqual([]);
  });

  it('detects added properties', () => {
    const oldMap = new Map([['color', 'red']]);
    const newMap = new Map([['color', 'red'], ['font-size', '16px']]);
    expect(diffStyleProperties(oldMap, newMap)).toEqual(['font-size']);
  });

  it('detects removed properties', () => {
    const oldMap = new Map([['color', 'red'], ['font-size', '16px']]);
    const newMap = new Map([['color', 'red']]);
    expect(diffStyleProperties(oldMap, newMap)).toEqual(['font-size']);
  });

  it('detects changed properties', () => {
    const oldMap = new Map([['color', 'red']]);
    const newMap = new Map([['color', 'blue']]);
    expect(diffStyleProperties(oldMap, newMap)).toEqual(['color']);
  });

  it('detects multiple changes', () => {
    const oldMap = new Map([['color', 'red'], ['margin', '0']]);
    const newMap = new Map([['color', 'blue'], ['padding', '10px']]);
    const diff = diffStyleProperties(oldMap, newMap);
    expect(diff).toContain('color');   // changed
    expect(diff).toContain('padding'); // added
    expect(diff).toContain('margin');  // removed
    expect(diff.length).toBe(3);
  });

  it('handles empty maps', () => {
    expect(diffStyleProperties(new Map(), new Map())).toEqual([]);
    const map = new Map([['color', 'red']]);
    expect(diffStyleProperties(new Map(), map)).toEqual(['color']);
    expect(diffStyleProperties(map, new Map())).toEqual(['color']);
  });
});
