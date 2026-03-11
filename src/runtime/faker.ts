/**
 * Lightweight faker module for Z10 runtime (~4KB).
 * Generates stable fake data seeded by node ID for consistent values across reloads.
 *
 * Supported categories (per PRD Section 6.2):
 * person names, company names, lorem text, dates, numbers, images,
 * addresses, finance amounts, colors, phone numbers.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic random from a seed
// ---------------------------------------------------------------------------

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash | 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(nodeId: string, index: number = 0): () => number {
  return mulberry32(hashString(`${nodeId}:${index}`));
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function intRange(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'Logan', 'Mia', 'Lucas', 'Charlotte', 'James', 'Amelia',
  'Alexander', 'Harper', 'Benjamin', 'Evelyn', 'Daniel', 'Aria', 'Henry',
  'Ella', 'Sebastian', 'Scarlett', 'Jack', 'Grace', 'Owen', 'Lily', 'Samuel',
] as const;

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Young',
] as const;

const COMPANY_SUFFIXES = ['Inc', 'LLC', 'Group', 'Corp', 'Co', 'Ltd', 'Labs', 'Studio'] as const;

const COMPANY_ADJECTIVES = [
  'Global', 'Digital', 'Creative', 'Advanced', 'Dynamic', 'Strategic',
  'Premier', 'Quantum', 'Apex', 'Nova', 'Bright', 'Swift', 'Core',
  'Peak', 'Stellar', 'Nexus', 'Vertex', 'Pulse', 'Zenith', 'Arc',
] as const;

const COMPANY_NOUNS = [
  'Solutions', 'Technologies', 'Systems', 'Ventures', 'Industries',
  'Dynamics', 'Analytics', 'Innovations', 'Networks', 'Partners',
  'Capital', 'Media', 'Works', 'Digital', 'Designs', 'Labs',
] as const;

const CATCH_PHRASES = [
  'Innovative solutions for modern challenges',
  'Empowering digital transformation',
  'Building the future, today',
  'Where innovation meets excellence',
  'Transforming ideas into reality',
  'Driving growth through technology',
  'Simplifying complexity',
  'Your partner in progress',
  'Redefining industry standards',
  'Engineering tomorrow\'s solutions',
  'Connecting people and technology',
  'Leading the digital revolution',
] as const;

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam',
  'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi',
  'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure',
  'in', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum', 'fugiat',
  'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat',
] as const;

const STREET_SUFFIXES = [
  'Street', 'Avenue', 'Boulevard', 'Drive', 'Lane', 'Road', 'Way',
  'Court', 'Place', 'Circle', 'Trail', 'Parkway',
] as const;

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'San Antonio',
  'San Diego', 'Dallas', 'Austin', 'San Francisco', 'Seattle', 'Denver',
  'Boston', 'Portland', 'Nashville', 'Atlanta', 'Miami', 'Minneapolis',
] as const;

const STATES = [
  'CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI',
  'WA', 'AZ', 'MA', 'CO', 'OR', 'TN', 'MN', 'IN', 'MO', 'VA',
] as const;

const COLORS_HEX = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
] as const;

const COLOR_NAMES = [
  'Red', 'Orange', 'Amber', 'Yellow', 'Lime', 'Green',
  'Teal', 'Cyan', 'Sky', 'Blue', 'Indigo', 'Violet',
  'Purple', 'Fuchsia', 'Pink', 'Rose',
] as const;

// ---------------------------------------------------------------------------
// Faker generators by category path (e.g. "person.firstName")
// ---------------------------------------------------------------------------

type FakerGenerator = (rng: () => number) => string;

const generators: Record<string, FakerGenerator> = {
  // Person
  'person.firstName': (rng) => pick(rng, FIRST_NAMES),
  'person.lastName': (rng) => pick(rng, LAST_NAMES),
  'person.fullName': (rng) => `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
  'person.name': (rng) => `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,

  // Company
  'company.name': (rng) => `${pick(rng, COMPANY_ADJECTIVES)} ${pick(rng, COMPANY_NOUNS)}`,
  'company.catchPhrase': (rng) => pick(rng, CATCH_PHRASES),
  'company.suffix': (rng) => pick(rng, COMPANY_SUFFIXES),

  // Lorem
  'lorem.word': (rng) => pick(rng, LOREM_WORDS),
  'lorem.words': (rng) => {
    const count = intRange(rng, 3, 7);
    return Array.from({ length: count }, () => pick(rng, LOREM_WORDS)).join(' ');
  },
  'lorem.sentence': (rng) => {
    const count = intRange(rng, 5, 12);
    const words = Array.from({ length: count }, () => pick(rng, LOREM_WORDS)).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1) + '.';
  },
  'lorem.paragraph': (rng) => {
    const count = intRange(rng, 3, 6);
    return Array.from({ length: count }, () => {
      const wc = intRange(rng, 5, 12);
      const words = Array.from({ length: wc }, () => pick(rng, LOREM_WORDS)).join(' ');
      return words.charAt(0).toUpperCase() + words.slice(1) + '.';
    }).join(' ');
  },

  // Date
  'date.recent': (rng) => {
    const daysAgo = intRange(rng, 0, 30);
    const d = new Date(2026, 2, 11); // Fixed reference: March 11, 2026
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  },
  'date.past': (rng) => {
    const daysAgo = intRange(rng, 30, 365);
    const d = new Date(2026, 2, 11);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  },
  'date.future': (rng) => {
    const daysAhead = intRange(rng, 1, 365);
    const d = new Date(2026, 2, 11);
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  },
  'date.month': (rng) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return pick(rng, months);
  },

  // Number
  'number.int': (rng) => String(intRange(rng, 0, 1000)),
  'number.float': (rng) => (rng() * 1000).toFixed(2),
  'number.percentage': (rng) => `${intRange(rng, 0, 100)}%`,

  // Image (placeholder URLs using dimensions)
  'image.avatar': (rng) => `https://i.pravatar.cc/150?u=${intRange(rng, 1, 9999)}`,
  'image.url': (rng) => `https://picsum.photos/seed/${intRange(rng, 1, 9999)}/400/300`,
  'image.thumbnail': (rng) => `https://picsum.photos/seed/${intRange(rng, 1, 9999)}/150/150`,

  // Address
  'address.street': (rng) => `${intRange(rng, 100, 9999)} ${pick(rng, LAST_NAMES)} ${pick(rng, STREET_SUFFIXES)}`,
  'address.city': (rng) => pick(rng, CITIES),
  'address.state': (rng) => pick(rng, STATES),
  'address.zip': (rng) => String(intRange(rng, 10000, 99999)),
  'address.full': (rng) => {
    const street = `${intRange(rng, 100, 9999)} ${pick(rng, LAST_NAMES)} ${pick(rng, STREET_SUFFIXES)}`;
    return `${street}, ${pick(rng, CITIES)}, ${pick(rng, STATES)} ${intRange(rng, 10000, 99999)}`;
  },

  // Finance
  'finance.amount': (rng) => (rng() * 10000).toFixed(2),
  'finance.currency': (rng) => pick(rng, ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']),
  'finance.price': (rng) => `$${(rng() * 999 + 0.99).toFixed(2)}`,
  'finance.accountNumber': (rng) => String(intRange(rng, 10000000, 99999999)),

  // Color
  'color.hex': (rng) => pick(rng, COLORS_HEX),
  'color.name': (rng) => pick(rng, COLOR_NAMES),
  'color.rgb': (rng) => `rgb(${intRange(rng, 0, 255)}, ${intRange(rng, 0, 255)}, ${intRange(rng, 0, 255)})`,

  // Phone
  'phone.number': (rng) => `(${intRange(rng, 200, 999)}) ${intRange(rng, 200, 999)}-${intRange(rng, 1000, 9999)}`,
  'phone.international': (rng) => `+1-${intRange(rng, 200, 999)}-${intRange(rng, 200, 999)}-${intRange(rng, 1000, 9999)}`,

  // Internet
  'internet.email': (rng) => {
    const first = pick(rng, FIRST_NAMES).toLowerCase();
    const last = pick(rng, LAST_NAMES).toLowerCase();
    const domain = pick(rng, ['gmail.com', 'outlook.com', 'example.com', 'mail.com']);
    return `${first}.${last}@${domain}`;
  },
  'internet.url': (rng) => {
    const word = pick(rng, COMPANY_ADJECTIVES).toLowerCase();
    return `https://www.${word}.com`;
  },
  'internet.username': (rng) => {
    const first = pick(rng, FIRST_NAMES).toLowerCase();
    return `${first}${intRange(rng, 1, 999)}`;
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a faker path to a generated value, seeded by nodeId for stability.
 *
 * @param fakerPath - Dot-notation path like "person.firstName", "company.name"
 * @param nodeId - Stable node ID used as seed for deterministic output
 * @param index - Optional index for repeat contexts (e.g., item in a list)
 * @returns Generated fake value, or the fakerPath itself if unknown
 */
export function resolveFaker(fakerPath: string, nodeId: string, index: number = 0): string {
  const generator = generators[fakerPath];
  if (!generator) {
    return fakerPath; // Return the path as-is if unknown
  }
  const rng = createRng(nodeId, index);
  return generator(rng);
}

/**
 * Check if a faker path is valid/supported.
 */
export function isFakerPath(path: string): boolean {
  return path in generators;
}

/**
 * Get all supported faker categories and their paths.
 */
export function getFakerCategories(): Record<string, string[]> {
  const categories: Record<string, string[]> = {};
  for (const path of Object.keys(generators)) {
    const category = path.split('.')[0]!;
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category]!.push(path);
  }
  return categories;
}

/**
 * Resolve faker props for a repeat command.
 * Takes a props object where values may be { faker: "path" } and resolves them.
 */
export function resolveFakerProps(
  props: Record<string, { faker: string } | string | number | boolean>,
  nodeId: string,
  index: number = 0,
): Record<string, string | number | boolean> {
  const resolved: Record<string, string | number | boolean> = {};
  for (const [key, val] of Object.entries(props)) {
    if (typeof val === 'object' && val !== null && 'faker' in val) {
      resolved[key] = resolveFaker(val.faker, `${nodeId}:${key}`, index);
    } else {
      resolved[key] = val as string | number | boolean;
    }
  }
  return resolved;
}
