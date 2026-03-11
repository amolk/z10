import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateConfig,
  isValidConfig,
  updateConfig,
  getConfigValue,
  setConfigValue,
  parseConfigFile,
  serializeConfigFile,
  applyConfigFile,
  extractConfigFile,
  CONFIG_KEYS,
} from '../../src/core/config.js';
import { createDocument } from '../../src/core/document.js';
import type { Z10Document } from '../../src/core/types.js';

describe('config', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = createDocument({ name: 'TestProject', version: '2.0', governance: 'full-edit', defaultMode: 'light' });
  });

  describe('validateConfig', () => {
    it('accepts valid config', () => {
      expect(validateConfig({ name: 'MyApp', version: '1.0', governance: 'full-edit', defaultMode: 'dark' })).toEqual([]);
    });

    it('rejects empty name', () => {
      const errors = validateConfig({ name: '' });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.field).toBe('name');
    });

    it('rejects too-long name', () => {
      const errors = validateConfig({ name: 'a'.repeat(101) });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.field).toBe('name');
    });

    it('rejects invalid governance', () => {
      const errors = validateConfig({ governance: 'invalid' as any });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.field).toBe('governance');
    });

    it('rejects invalid defaultMode', () => {
      const errors = validateConfig({ defaultMode: 'blue' as any });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.field).toBe('defaultMode');
    });

    it('accepts all valid governance levels', () => {
      expect(validateConfig({ governance: 'full-edit' })).toEqual([]);
      expect(validateConfig({ governance: 'propose-approve' })).toEqual([]);
      expect(validateConfig({ governance: 'scoped-edit' })).toEqual([]);
    });

    it('returns multiple errors for multiple invalid fields', () => {
      const errors = validateConfig({ name: '', governance: 'bad' as any });
      expect(errors).toHaveLength(2);
    });
  });

  describe('isValidConfig', () => {
    it('returns true for valid config', () => {
      expect(isValidConfig({ name: 'Valid' })).toBe(true);
    });

    it('returns false for invalid config', () => {
      expect(isValidConfig({ governance: 'bad' as any })).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('updates valid fields', () => {
      const errors = updateConfig(doc, { name: 'NewName', governance: 'scoped-edit' });
      expect(errors).toEqual([]);
      expect(doc.config.name).toBe('NewName');
      expect(doc.config.governance).toBe('scoped-edit');
    });

    it('does not update on validation failure', () => {
      const errors = updateConfig(doc, { name: '' });
      expect(errors).toHaveLength(1);
      expect(doc.config.name).toBe('TestProject'); // unchanged
    });

    it('partially updates are safe', () => {
      updateConfig(doc, { version: '3.0' });
      expect(doc.config.version).toBe('3.0');
      expect(doc.config.name).toBe('TestProject'); // unchanged
    });
  });

  describe('getConfigValue', () => {
    it('returns config values by key', () => {
      expect(getConfigValue(doc, 'name')).toBe('TestProject');
      expect(getConfigValue(doc, 'version')).toBe('2.0');
      expect(getConfigValue(doc, 'governance')).toBe('full-edit');
      expect(getConfigValue(doc, 'defaultMode')).toBe('light');
    });
  });

  describe('setConfigValue', () => {
    it('sets valid values', () => {
      expect(setConfigValue(doc, 'name', 'Updated')).toBeNull();
      expect(doc.config.name).toBe('Updated');
    });

    it('returns error for invalid values', () => {
      const err = setConfigValue(doc, 'governance', 'bad');
      expect(err).toContain('Governance must be one of');
    });

    it('sets all key types', () => {
      expect(setConfigValue(doc, 'version', '5.0')).toBeNull();
      expect(setConfigValue(doc, 'governance', 'propose-approve')).toBeNull();
      expect(setConfigValue(doc, 'defaultMode', 'dark')).toBeNull();
      expect(doc.config.version).toBe('5.0');
      expect(doc.config.governance).toBe('propose-approve');
      expect(doc.config.defaultMode).toBe('dark');
    });
  });

  describe('config file operations', () => {
    it('parseConfigFile parses valid JSON', () => {
      const result = parseConfigFile('{"name":"Test","governance":"full-edit"}');
      expect(result).toEqual({ name: 'Test', governance: 'full-edit' });
    });

    it('parseConfigFile returns null for invalid JSON', () => {
      expect(parseConfigFile('not json')).toBeNull();
    });

    it('serializeConfigFile produces valid JSON', () => {
      const json = serializeConfigFile({ name: 'Test', version: '1.0' });
      expect(JSON.parse(json)).toEqual({ name: 'Test', version: '1.0' });
    });

    it('applyConfigFile merges into document', () => {
      const errors = applyConfigFile(doc, { name: 'FromFile', defaultMode: 'dark' });
      expect(errors).toEqual([]);
      expect(doc.config.name).toBe('FromFile');
      expect(doc.config.defaultMode).toBe('dark');
    });

    it('applyConfigFile validates before applying', () => {
      const errors = applyConfigFile(doc, { governance: 'invalid' as any });
      expect(errors).toHaveLength(1);
      expect(doc.config.governance).toBe('full-edit'); // unchanged
    });

    it('extractConfigFile extracts current config', () => {
      const file = extractConfigFile(doc);
      expect(file.name).toBe('TestProject');
      expect(file.version).toBe('2.0');
      expect(file.governance).toBe('full-edit');
      expect(file.defaultMode).toBe('light');
    });
  });

  describe('CONFIG_KEYS', () => {
    it('lists all expected keys', () => {
      const keys = CONFIG_KEYS.map(k => k.key);
      expect(keys).toContain('name');
      expect(keys).toContain('version');
      expect(keys).toContain('governance');
      expect(keys).toContain('defaultMode');
    });

    it('has descriptions for all keys', () => {
      for (const entry of CONFIG_KEYS) {
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });
  });
});
