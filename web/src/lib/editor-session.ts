/**
 * EditorSession — plain TypeScript coordination layer for editor sync.
 *
 * Encapsulates the timing-sensitive coordination between:
 * - TransactionSender (POST /transact, txId tracking)
 * - PatchStream (SSE EventSource, reconnection)
 * - EditBridge (style edits → batched transactions)
 * - MutationBridge (structural edits → transactions)
 * - UndoManager (snapshot-based, suppressed during replay)
 * - PatchReplay (incoming ops → live DOM, undo suppression)
 *
 * The SyncCoordinator owns all shared mutable state:
 * - undoSuppression flag (single owner, not a shared ref)
 * - localTxIds set (self-dedup)
 * - replay sequencing
 *
 * This module is React-free. useEditorSession() is the thin React wrapper.
 *
 * Migration approach (strangler fig):
 * Phase 1 (current): Define types and interfaces. Existing hooks remain in use.
 * Phase 2: EditorSession delegates to existing hooks internally.
 * Phase 3: Replace hook internals one by one with coordinator methods.
 */

// ── Public types ──

export type SyncStatus = "connected" | "reconnecting" | "disconnected" | "error";

export interface EditorSessionState {
  content: string;
  syncStatus: SyncStatus;
  undoDepth: number;
  redoDepth: number;
  isReplayingRemote: boolean;
  pendingTxCount: number;
}

export type StructuralOp =
  | { type: "delete"; elementIds: string[] }
  | { type: "duplicate"; elementIds: string[] }
  | { type: "group"; elementIds: string[] }
  | { type: "ungroup"; groupId: string }
  | { type: "reorder"; elementId: string; position: "up" | "down" | "front" | "back" }
  | { type: "paste"; clipboard: ClipboardPayload; target?: string };

export interface ClipboardPayload {
  html: string;
  sourceIds: string[];
}

export interface EditorMutator {
  applyStructural(op: StructuralOp): void;
  applyStyle(elementId: string, styles: Record<string, string>): void;
  undo(): void;
  redo(): void;
  setContent(content: string): void;
}

export interface EditorSessionConfig {
  projectId: string;
  initialContent: string;
  canvasRef: React.RefObject<HTMLElement | null>;
  onSyncError?: (error: SyncError) => void;
}

export interface SyncError {
  type: "connection" | "transaction" | "replay";
  message: string;
  recoverable: boolean;
}

// ── SyncCoordinator ──
// Single owner of timing-sensitive shared state.
// In Phase 1, this is a type definition only.
// In Phase 2+, it replaces the scattered refs.

export interface SyncCoordinator {
  /** Whether undo recording should be suppressed (during remote patch replay). */
  readonly isReplayingSuppressed: boolean;

  /** Register a local transaction ID for self-dedup. */
  registerLocalTx(txId: number): void;

  /** Check if a patch originated from this client. */
  isOwnTx(txId: number): boolean;

  /** Begin replay suppression (before applying remote patches). */
  beginReplay(): void;

  /** End replay suppression (after microtask settle). */
  endReplay(): void;
}

// ── EditorSession interface ──

export interface EditorSession {
  readonly state: EditorSessionState;
  readonly mutate: EditorMutator;
  destroy(): void;
}

// ── Factory (Phase 2+) ──
// Uncomment and implement when ready to wire hooks internally.
//
// export function createEditorSession(config: EditorSessionConfig): EditorSession {
//   ...
// }
