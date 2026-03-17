/**
 * Factory functions that bridge core/runtime for ComponentRegistry.
 *
 * The ComponentRegistry class itself never imports from runtime/.
 * This factory is the only module that bridges the boundary,
 * preserving the layer invariant.
 */

import type { Z10Document } from './types.js';
import { ComponentRegistry, type SubstituteFn } from './component-registry.js';
import { resolveFaker } from '../runtime/faker.js';

const fakerSubstitute: SubstituteFn = (template, props, nodeId, index = 0) => {
  return template.replace(/\{\{(\w[\w.]*(?::[\w.]+)?)\}\}/g, (_match, expr: string) => {
    if (expr.startsWith('faker:')) {
      return resolveFaker(expr.slice(6), nodeId, index);
    }
    if (expr in props) return String(props[expr]);
    return '';
  });
};

/** Create a ComponentRegistry with faker-aware template substitution. */
export function createRegistry(doc: Z10Document): ComponentRegistry {
  return new ComponentRegistry(doc, { substitute: fakerSubstitute });
}

/** Create a ComponentRegistry with simple {{propName}} substitution (no faker). */
export function createSimpleRegistry(doc: Z10Document): ComponentRegistry {
  return new ComponentRegistry(doc);
}

/** Faker-aware substituteTemplate for callers who need it standalone. */
export const substituteTemplate = fakerSubstitute;
