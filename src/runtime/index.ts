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
  generateClassBody,
} from './web-components.js';

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
