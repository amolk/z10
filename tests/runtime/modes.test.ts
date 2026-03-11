import { describe, it, expect, beforeEach } from 'vitest';
import {
  setPageMode,
  togglePageMode,
  setAllPagesMode,
  setDocumentMode,
  getPageMode,
  getAllPageModes,
  hasMixedModes,
  resolveTokenForMode,
} from '../../src/runtime/modes.js';
import { createDocument, addPage, setToken } from '../../src/core/document.js';
import type { Z10Document } from '../../src/core/types.js';

describe('modes', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = createDocument({ name: 'Test', version: '1.0', governance: 'full-edit', defaultMode: 'light' });
    addPage(doc, { name: 'Home', rootNodeId: 'home_root', mode: 'light' });
    addPage(doc, { name: 'About', rootNodeId: 'about_root', mode: 'light' });
  });

  describe('setPageMode', () => {
    it('changes page mode', () => {
      const changed = setPageMode(doc, 'Home', 'dark');
      expect(changed).toBe(true);
      expect(doc.pages[0]!.mode).toBe('dark');
    });

    it('returns false if already in that mode', () => {
      const changed = setPageMode(doc, 'Home', 'light');
      expect(changed).toBe(false);
    });

    it('returns false for unknown page', () => {
      const changed = setPageMode(doc, 'NotExist', 'dark');
      expect(changed).toBe(false);
    });
  });

  describe('togglePageMode', () => {
    it('toggles from light to dark', () => {
      const result = togglePageMode(doc, 'Home');
      expect(result).toBe('dark');
    });

    it('toggles from dark to light', () => {
      setPageMode(doc, 'Home', 'dark');
      const result = togglePageMode(doc, 'Home');
      expect(result).toBe('light');
    });

    it('returns null for unknown page', () => {
      expect(togglePageMode(doc, 'NotExist')).toBeNull();
    });
  });

  describe('setAllPagesMode', () => {
    it('changes all pages to dark', () => {
      const changed = setAllPagesMode(doc, 'dark');
      expect(changed).toBe(2);
      expect(doc.pages.every(p => p.mode === 'dark')).toBe(true);
    });

    it('returns 0 if all already in that mode', () => {
      const changed = setAllPagesMode(doc, 'light');
      expect(changed).toBe(0);
    });

    it('only counts changed pages', () => {
      setPageMode(doc, 'Home', 'dark');
      const changed = setAllPagesMode(doc, 'dark');
      expect(changed).toBe(1); // Only About changed
    });
  });

  describe('setDocumentMode', () => {
    it('updates config and all pages', () => {
      setDocumentMode(doc, 'dark');
      expect(doc.config.defaultMode).toBe('dark');
      expect(doc.pages.every(p => p.mode === 'dark')).toBe(true);
    });
  });

  describe('getPageMode', () => {
    it('returns page mode', () => {
      expect(getPageMode(doc, 'Home')).toBe('light');
    });

    it('returns null for unknown page', () => {
      expect(getPageMode(doc, 'NotExist')).toBeNull();
    });
  });

  describe('getAllPageModes', () => {
    it('returns all page modes', () => {
      const modes = getAllPageModes(doc);
      expect(modes).toEqual([
        { name: 'Home', mode: 'light' },
        { name: 'About', mode: 'light' },
      ]);
    });
  });

  describe('hasMixedModes', () => {
    it('returns false when all same', () => {
      expect(hasMixedModes(doc)).toBe(false);
    });

    it('returns true when mixed', () => {
      setPageMode(doc, 'Home', 'dark');
      expect(hasMixedModes(doc)).toBe(true);
    });

    it('returns false for single page', () => {
      const singleDoc = createDocument();
      addPage(singleDoc, { name: 'Only', rootNodeId: 'r', mode: 'light' });
      expect(hasMixedModes(singleDoc)).toBe(false);
    });
  });

  describe('resolveTokenForMode', () => {
    beforeEach(() => {
      // Set up mode-specific tokens
      setToken(doc, { name: '--bg-color-light', value: '#ffffff', collection: 'semantic' });
      setToken(doc, { name: '--bg-color-dark', value: '#1a1a2e', collection: 'semantic' });
      setToken(doc, { name: '--bg-color', value: '#f0f0f0', collection: 'semantic' });
      setToken(doc, { name: '--blue-500', value: '#3b82f6', collection: 'primitives' });
    });

    it('resolves mode-specific semantic token', () => {
      expect(resolveTokenForMode(doc, '--bg-color', 'light')).toBe('#ffffff');
      expect(resolveTokenForMode(doc, '--bg-color', 'dark')).toBe('#1a1a2e');
    });

    it('falls back to base semantic token if no mode-specific exists', () => {
      expect(resolveTokenForMode(doc, '--text-color', 'light')).toBeNull();
      setToken(doc, { name: '--text-color', value: '#333', collection: 'semantic' });
      expect(resolveTokenForMode(doc, '--text-color', 'light')).toBe('#333');
    });

    it('falls back to primitive token', () => {
      expect(resolveTokenForMode(doc, '--blue-500', 'light')).toBe('#3b82f6');
    });

    it('returns null for unknown token', () => {
      expect(resolveTokenForMode(doc, '--nonexistent', 'light')).toBeNull();
    });
  });
});
