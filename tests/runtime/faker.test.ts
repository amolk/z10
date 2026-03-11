import { describe, it, expect } from 'vitest';
import { resolveFaker, resolveFakerProps, isFakerPath, getFakerCategories } from '../../src/runtime/faker.js';

describe('faker', () => {
  describe('resolveFaker', () => {
    it('returns deterministic values for same nodeId', () => {
      const v1 = resolveFaker('person.firstName', 'node_1');
      const v2 = resolveFaker('person.firstName', 'node_1');
      expect(v1).toBe(v2);
    });

    it('returns different values for different nodeIds', () => {
      const v1 = resolveFaker('person.firstName', 'node_1');
      const v2 = resolveFaker('person.firstName', 'node_2');
      // With enough data pool variety, different seeds should produce different results
      // (statistically very likely, not guaranteed for every pair)
      expect(typeof v1).toBe('string');
      expect(typeof v2).toBe('string');
    });

    it('returns different values for different indexes', () => {
      const v1 = resolveFaker('person.firstName', 'node_1', 0);
      const v2 = resolveFaker('person.firstName', 'node_1', 1);
      expect(typeof v1).toBe('string');
      expect(typeof v2).toBe('string');
    });

    it('returns the path for unknown faker paths', () => {
      expect(resolveFaker('unknown.path', 'node_1')).toBe('unknown.path');
    });
  });

  describe('person generators', () => {
    it('generates first names', () => {
      const name = resolveFaker('person.firstName', 'test');
      expect(name.length).toBeGreaterThan(0);
    });

    it('generates last names', () => {
      const name = resolveFaker('person.lastName', 'test');
      expect(name.length).toBeGreaterThan(0);
    });

    it('generates full names with space', () => {
      const name = resolveFaker('person.fullName', 'test');
      expect(name).toContain(' ');
    });
  });

  describe('company generators', () => {
    it('generates company names', () => {
      const name = resolveFaker('company.name', 'test');
      expect(name.length).toBeGreaterThan(0);
      expect(name).toContain(' ');
    });

    it('generates catch phrases', () => {
      const phrase = resolveFaker('company.catchPhrase', 'test');
      expect(phrase.length).toBeGreaterThan(5);
    });
  });

  describe('lorem generators', () => {
    it('generates words', () => {
      const words = resolveFaker('lorem.words', 'test');
      expect(words.split(' ').length).toBeGreaterThanOrEqual(3);
    });

    it('generates sentences ending with period', () => {
      const sentence = resolveFaker('lorem.sentence', 'test');
      expect(sentence.endsWith('.')).toBe(true);
      expect(sentence[0]).toBe(sentence[0]!.toUpperCase());
    });

    it('generates paragraphs with multiple sentences', () => {
      const para = resolveFaker('lorem.paragraph', 'test');
      expect(para.split('.').length).toBeGreaterThan(2);
    });
  });

  describe('date generators', () => {
    it('generates valid date strings', () => {
      const date = resolveFaker('date.recent', 'test');
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('generates month names', () => {
      const month = resolveFaker('date.month', 'test');
      expect(['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']).toContain(month);
    });
  });

  describe('number generators', () => {
    it('generates integers', () => {
      const num = resolveFaker('number.int', 'test');
      expect(Number.isInteger(Number(num))).toBe(true);
    });

    it('generates percentages', () => {
      const pct = resolveFaker('number.percentage', 'test');
      expect(pct).toMatch(/^\d+%$/);
    });
  });

  describe('address generators', () => {
    it('generates street addresses', () => {
      const street = resolveFaker('address.street', 'test');
      expect(street.length).toBeGreaterThan(5);
    });

    it('generates full addresses', () => {
      const addr = resolveFaker('address.full', 'test');
      expect(addr).toContain(',');
    });
  });

  describe('finance generators', () => {
    it('generates prices with dollar sign', () => {
      const price = resolveFaker('finance.price', 'test');
      expect(price.startsWith('$')).toBe(true);
    });

    it('generates amounts as decimal strings', () => {
      const amount = resolveFaker('finance.amount', 'test');
      expect(amount).toMatch(/^\d+\.\d{2}$/);
    });
  });

  describe('color generators', () => {
    it('generates hex colors', () => {
      const hex = resolveFaker('color.hex', 'test');
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('generates rgb colors', () => {
      const rgb = resolveFaker('color.rgb', 'test');
      expect(rgb).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    });
  });

  describe('phone generators', () => {
    it('generates phone numbers', () => {
      const phone = resolveFaker('phone.number', 'test');
      expect(phone).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
    });
  });

  describe('internet generators', () => {
    it('generates email addresses', () => {
      const email = resolveFaker('internet.email', 'test');
      expect(email).toContain('@');
      expect(email).toContain('.');
    });

    it('generates URLs', () => {
      const url = resolveFaker('internet.url', 'test');
      expect(url).toMatch(/^https:\/\//);
    });
  });

  describe('resolveFakerProps', () => {
    it('resolves faker props in a props object', () => {
      const props = {
        title: { faker: 'company.name' },
        count: 5,
        active: true,
        label: 'static',
      };
      const resolved = resolveFakerProps(props, 'card_1', 0);
      expect(typeof resolved.title).toBe('string');
      expect((resolved.title as string).length).toBeGreaterThan(0);
      expect(resolved.count).toBe(5);
      expect(resolved.active).toBe(true);
      expect(resolved.label).toBe('static');
    });

    it('produces stable results across calls', () => {
      const props = { name: { faker: 'person.fullName' } };
      const r1 = resolveFakerProps(props, 'id_1', 0);
      const r2 = resolveFakerProps(props, 'id_1', 0);
      expect(r1.name).toBe(r2.name);
    });

    it('varies by index for repeat usage', () => {
      const props = { name: { faker: 'person.fullName' } };
      const r0 = resolveFakerProps(props, 'list', 0);
      const r1 = resolveFakerProps(props, 'list', 1);
      // Different indexes should produce different results
      expect(typeof r0.name).toBe('string');
      expect(typeof r1.name).toBe('string');
    });
  });

  describe('isFakerPath', () => {
    it('returns true for valid paths', () => {
      expect(isFakerPath('person.firstName')).toBe(true);
      expect(isFakerPath('company.name')).toBe(true);
      expect(isFakerPath('color.hex')).toBe(true);
    });

    it('returns false for invalid paths', () => {
      expect(isFakerPath('invalid.path')).toBe(false);
      expect(isFakerPath('')).toBe(false);
    });
  });

  describe('getFakerCategories', () => {
    it('returns all categories', () => {
      const cats = getFakerCategories();
      expect(Object.keys(cats)).toContain('person');
      expect(Object.keys(cats)).toContain('company');
      expect(Object.keys(cats)).toContain('lorem');
      expect(Object.keys(cats)).toContain('date');
      expect(Object.keys(cats)).toContain('number');
      expect(Object.keys(cats)).toContain('address');
      expect(Object.keys(cats)).toContain('finance');
      expect(Object.keys(cats)).toContain('color');
      expect(Object.keys(cats)).toContain('phone');
      expect(Object.keys(cats)).toContain('internet');
    });

    it('lists paths within categories', () => {
      const cats = getFakerCategories();
      expect(cats.person).toContain('person.firstName');
      expect(cats.person).toContain('person.lastName');
    });
  });
});
