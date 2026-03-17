export * from './types.js';
export * from './document.js';
export * from './config.js';
export {
  ComponentRegistry,
} from './component-registry.js';
export type {
  ResolvedInstance,
  RegistrationResult,
  ExpansionError,
  SubstituteFn,
} from './component-registry.js';
export {
  createRegistry,
  createSimpleRegistry,
  substituteTemplate,
} from './component-factory.js';
