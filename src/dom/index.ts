/**
 * src/dom/ — Core collaborative DOM engine.
 * Pure logic + tests, no network, no UI.
 * Environment-agnostic: runs in happy-dom (server + CLI) and browser DOM (web UI).
 */

// A1. Logical clock
export { LamportClock } from './clock.js';

// A2. Timestamp attribute system
export {
  TS_NODE, TS_CHILDREN, TS_TEXT, TS_TREE,
  TS_ATTR_PREFIX, TS_STYLE_PREFIX,
  getTimestamp, setTimestamp,
  tsAttrName, tsStylePropName,
  setInitialTimestamps,
  bubbleTimestamp, bumpTimestamps,
  type Facet, type WriteSetEntry,
} from './timestamps.js';

// A3. Style string utilities
export { parseStyleString, diffStyleProperties } from './styles.js';

// A4. Document bootstrapping
export { bootstrapDocument, type BootstrapOptions } from './bootstrap.js';

// A12. Node ID assignment
export { assignNodeIds, createIdGenerator } from './node-ids.js';
