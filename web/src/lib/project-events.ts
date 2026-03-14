/**
 * Helpers for classifying MCP tool operations.
 *
 * The ProjectEventBus and content-updated event type were removed in D6 —
 * replaced by PatchBroadcast (src/dom/patch-broadcast.ts) which sends
 * patch diffs instead of full serialized content.
 */

/** Operation type for agent edit classification */
export type OperationType =
  | "add"       // z10_node, z10_text, z10_instance, z10_repeat
  | "modify"    // z10_style, z10_move, z10_attr, write_html
  | "remove"    // z10_remove
  | "define"    // z10_component, z10_tokens
  | "batch";    // z10_batch (contains sub-operations)

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
