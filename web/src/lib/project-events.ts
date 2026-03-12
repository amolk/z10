/**
 * In-memory event bus for real-time project updates.
 *
 * MCP write tool handlers emit events here; the SSE endpoint
 * (/api/projects/[projectId]/events) forwards them to connected browsers.
 *
 * Both run in the same Next.js server process, so a simple EventTarget works.
 */

/** Operation type for agent edit highlighting and activity panel */
export type OperationType =
  | "add"       // z10_node, z10_text, z10_instance, z10_repeat
  | "modify"    // z10_style, z10_move, z10_attr, write_html
  | "remove"    // z10_remove
  | "define"    // z10_component, z10_tokens
  | "batch";    // z10_batch (contains sub-operations)

export type ProjectEvent = {
  type: "content-updated";
  projectId: string;
  /** Full serialized .z10.html content after the write */
  content: string;
  /** Which MCP tool triggered this update */
  tool: string;
  /** Classified operation type for UI highlighting */
  operation: OperationType;
  /** Element IDs affected by this operation (empty for define/tokens) */
  affectedIds: string[];
  /** The raw tool result JSON (for activity panel display) */
  toolResult: string;
  /** ISO timestamp */
  timestamp: string;
};

type Listener = (event: ProjectEvent) => void;

class ProjectEventBus {
  private listeners = new Map<string, Set<Listener>>();

  /** Subscribe to events for a specific project */
  subscribe(projectId: string, listener: Listener): () => void {
    if (!this.listeners.has(projectId)) {
      this.listeners.set(projectId, new Set());
    }
    this.listeners.get(projectId)!.add(listener);

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(projectId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(projectId);
      }
    };
  }

  /** Emit an event to all listeners for a project */
  emit(event: ProjectEvent) {
    const set = this.listeners.get(event.projectId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // Don't let one bad listener break others
      }
    }
  }

  /** Number of active listeners for a project (for diagnostics) */
  listenerCount(projectId: string): number {
    return this.listeners.get(projectId)?.size ?? 0;
  }
}

// Singleton — shared across all route handlers in the same process
export const projectEvents = new ProjectEventBus();

// ---------------------------------------------------------------------------
// Helpers for classifying tool operations
// ---------------------------------------------------------------------------

/** Map tool name → operation type */
export function classifyTool(toolName: string): OperationType {
  switch (toolName) {
    case "z10_node":
    case "z10_text":
    case "z10_instance":
    case "z10_repeat":
      return "add";
    case "z10_style":
    case "z10_move":
    case "z10_attr":
    case "write_html":
      return "modify";
    case "z10_remove":
      return "remove";
    case "z10_component":
    case "z10_tokens":
      return "define";
    case "z10_batch":
      return "batch";
    default:
      return "modify";
  }
}

/** Extract affected element IDs from tool args */
export function extractAffectedIds(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>
): string[] {
  switch (toolName) {
    case "z10_node":
    case "z10_text":
    case "z10_instance":
    case "z10_repeat":
    case "z10_style":
    case "z10_move":
    case "z10_remove":
    case "z10_attr":
    case "write_html":
      return args.id ? [args.id as string] : [];
    case "z10_batch": {
      // Extract IDs from all sub-commands
      const cmds = (args.commands ?? []) as Array<Record<string, unknown>>;
      const ids: string[] = [];
      for (const cmd of cmds) {
        if (cmd.id) ids.push(cmd.id as string);
      }
      return ids;
    }
    default:
      return [];
  }
}
