export * from './types.js';
export * from './document.js';
export * from './config.js';
export {
  ComponentRegistry,
  substituteTemplate as substituteTemplateSimple,
  resolveEffectiveAttributes,
  isComponentInstance,
  isComponentDefinition,
  propagateToInstances,
} from './component-registry.js';
export type {
  ResolvedInstance,
  RegistrationResult,
  ExpansionError,
  SubstituteFn,
} from './component-registry.js';
