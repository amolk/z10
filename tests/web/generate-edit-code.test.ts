/**
 * D4. Tests for JS code generation from human edit operations.
 *
 * Verifies that generateEditCode functions produce valid JS code strings
 * that, when executed against a DOM, produce the expected mutations.
 * Tests both the code generation and execution against happy-dom.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import {
  generateStyleCode,
  generateAttrCode,
  generateTextCode,
  generateRemoveCode,
  generateAddCode,
  generateReparentCode,
} from '../../web/src/lib/generate-edit-code';

describe('generateEditCode', () => {
  let window: InstanceType<typeof Window>;
  let document: Document;

  beforeEach(() => {
    window = new Window({ url: 'https://z10.dev' });
    document = window.document as unknown as Document;
    document.body.innerHTML = `
      <div data-z10-id="page" data-z10-page="Page 1">
        <div data-z10-id="card" style="padding: 16px; background: white;">
          <span data-z10-id="title">Hello World</span>
          <p data-z10-id="desc">Description</p>
        </div>
        <div data-z10-id="footer" style="padding: 8px;"></div>
      </div>
    `;
  });

  /** Helper: execute generated code against the test DOM */
  function exec(code: string) {
    // eslint-disable-next-line no-new-func
    const fn = new Function('document', code);
    fn(document);
  }

  describe('generateStyleCode', () => {
    it('should generate valid JS for single style property', () => {
      const code = generateStyleCode('card', { width: '200px' });
      expect(code).toContain('querySelector');
      expect(code).toContain('data-z10-id="card"');
      expect(code).toContain('setProperty');
      expect(code).toContain('"width"');
      expect(code).toContain('"200px"');

      exec(code);
      const card = document.querySelector('[data-z10-id="card"]') as HTMLElement;
      expect(card.style.width).toBe('200px');
    });

    it('should generate valid JS for multiple style properties', () => {
      const code = generateStyleCode('card', {
        width: '300px',
        'background-color': 'navy',
        'border-radius': '8px',
      });

      exec(code);
      const card = document.querySelector('[data-z10-id="card"]') as HTMLElement;
      expect(card.style.width).toBe('300px');
      expect(card.style.backgroundColor).toBe('navy');
      expect(card.style.borderRadius).toBe('8px');
    });

    it('should return empty string for empty styles', () => {
      expect(generateStyleCode('card', {})).toBe('');
    });

    it('should handle special characters in values', () => {
      const code = generateStyleCode('card', {
        'font-family': '"Helvetica Neue", sans-serif',
      });
      exec(code);
      const card = document.querySelector('[data-z10-id="card"]') as HTMLElement;
      expect(card.style.fontFamily).toContain('Helvetica Neue');
    });
  });

  describe('generateAttrCode', () => {
    it('should generate valid JS for setting an attribute', () => {
      const code = generateAttrCode('card', 'class', 'hero-card');
      exec(code);
      expect(document.querySelector('[data-z10-id="card"]')?.getAttribute('class')).toBe('hero-card');
    });

    it('should handle attribute values with quotes', () => {
      const code = generateAttrCode('card', 'data-label', 'He said "hi"');
      exec(code);
      expect(document.querySelector('[data-z10-id="card"]')?.getAttribute('data-label')).toBe('He said "hi"');
    });
  });

  describe('generateTextCode', () => {
    it('should generate valid JS for setting text content', () => {
      const code = generateTextCode('title', 'New Title');
      exec(code);
      expect(document.querySelector('[data-z10-id="title"]')?.textContent).toBe('New Title');
    });

    it('should handle text with special characters', () => {
      const code = generateTextCode('title', 'Price: $9.99 <sale>');
      exec(code);
      expect(document.querySelector('[data-z10-id="title"]')?.textContent).toBe('Price: $9.99 <sale>');
    });
  });

  describe('generateRemoveCode', () => {
    it('should generate valid JS for removing an element', () => {
      const code = generateRemoveCode('desc');
      exec(code);
      expect(document.querySelector('[data-z10-id="desc"]')).toBeNull();
    });

    it('should not throw for non-existent elements', () => {
      const code = generateRemoveCode('nonexistent');
      expect(() => exec(code)).not.toThrow();
    });
  });

  describe('generateAddCode', () => {
    it('should generate valid JS for appending a new element', () => {
      const code = generateAddCode(
        'card',
        '<button data-z10-id="btn" style="color: blue;">Click</button>',
      );
      exec(code);
      const btn = document.querySelector('[data-z10-id="btn"]');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('Click');
      expect(btn?.parentElement?.getAttribute('data-z10-id')).toBe('card');
    });

    it('should generate valid JS for inserting before a sibling', () => {
      const code = generateAddCode(
        'card',
        '<em data-z10-id="subtitle">Sub</em>',
        'desc',
      );
      exec(code);
      const card = document.querySelector('[data-z10-id="card"]')!;
      const children = Array.from(card.children).map(c => c.getAttribute('data-z10-id'));
      expect(children.indexOf('subtitle')).toBeLessThan(children.indexOf('desc'));
    });
  });

  describe('generateReparentCode', () => {
    it('should generate valid JS for moving an element to a new parent', () => {
      const code = generateReparentCode('title', 'footer');
      exec(code);
      const title = document.querySelector('[data-z10-id="title"]');
      expect(title?.parentElement?.getAttribute('data-z10-id')).toBe('footer');
    });

    it('should generate valid JS for moving with beforeId', () => {
      // Add a child to footer first
      const addCode = generateAddCode('footer', '<span data-z10-id="copy">©</span>');
      exec(addCode);

      const code = generateReparentCode('title', 'footer', 'copy');
      exec(code);
      const footer = document.querySelector('[data-z10-id="footer"]')!;
      const children = Array.from(footer.children).map(c => c.getAttribute('data-z10-id'));
      expect(children.indexOf('title')).toBeLessThan(children.indexOf('copy'));
    });
  });
});
