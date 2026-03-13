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

// A5. Write set builder
export { buildWriteSet } from './write-set.js';

// A8. Illegal modification check
export { checkIllegalModifications, type IllegalModification } from './checks.js';

// A13. Subtree locking
export { SubtreeLockManager } from './locks.js';

// A14. Patch serialization
export {
  serializeMutationsToOps, createPatchEnvelope,
  type PatchOp, type AttrOp, type StyleOp, type TextOp, type AddOp, type RemoveOp,
  type PatchEnvelope,
} from './patch-serialize.js';

// A15. Patch replay
export { replayPatch } from './patch-replay.js';

// A16. Patch ring buffer
export { PatchRingBuffer } from './patch-buffer.js';

// A6. Per-facet validator
export {
  validate, preCheckTreeTimestamp, buildManifest,
  type TimestampManifest, type NodeManifestEntry, type Conflict,
} from './validator.js';

// A7. Sandbox execution context
export { createSandboxContext, executeSandboxCode, type SandboxResult } from './sandbox.js';

// A9. Transaction engine + A10. Commit procedure
export {
  TransactionEngine,
  type TransactionResult, type TransactionCommitted, type TransactionRejected,
  type TransactionEngineOptions,
} from './transaction.js';

// A11. Reconcile children
export { reconcileChildren } from './reconcile.js';

// A17. Metadata stripping
export { stripForAgent, stripForExport } from './strip.js';

// B1-B4. Local Proxy
export {
  LocalProxy,
  type LocalProxyOptions,
  type ReadTicket, type SubtreeResult, type RefreshResult,
  type SubmitResult, type SubmitSuccess, type SubmitRejected,
} from './proxy.js';
