/**
 * Z10 Runtime — lightweight runtime for template instantiation,
 * faker data generation, and mode switching.
 *
 * Per PRD Section 6: ~8KB gzipped, progressive enhancement.
 */

export {
  resolveFaker,
  resolveFakerProps,
  isFakerPath,
  getFakerCategories,
} from './faker.js';

export {
  substituteTemplate,
  expandInstance,
  resolveProps,
  instantiateTemplates,
} from './template.js';
export type { ExpandedInstance, InstantiationResult } from './template.js';

export {
  generateClassBody,
} from './web-components.js';

export {
  resolveEffectiveAttributes,
} from './template.js';

export {
  propagateToInstances,
  isComponentInstance,
  isComponentDefinition,
} from '../core/propagation.js';

export {
  setPageMode,
  togglePageMode,
  setAllPagesMode,
  setDocumentMode,
  getPageMode,
  getAllPageModes,
  hasMixedModes,
  resolveTokenForMode,
} from './modes.js';
