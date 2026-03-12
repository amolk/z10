"use client";

import { EditorProvider } from "@/lib/editor-state";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { useAutoSave } from "@/lib/use-auto-save";
import { useUndoRedo } from "@/lib/use-undo-redo";
import { useAgentStream } from "@/lib/use-agent-stream";
import { ToolsToolbar } from "@/components/tools-toolbar";
import { LayersPanel } from "@/components/layers-panel";
import { EditorCanvas } from "@/components/editor-canvas";
import { PropertiesPanel } from "@/components/properties-panel";
import { AgentStatusIndicator } from "@/components/agent-status-indicator";
import { useAgentHighlight } from "@/lib/use-agent-highlight";
import { AgentActivityPanel } from "@/components/agent-activity-panel";

export function EditorShell({
  projectId,
  initialContent,
}: {
  projectId: string;
  initialContent: string;
}) {
  return (
    <EditorProvider initialContent={initialContent}>
      <EditorShellInner projectId={projectId} initialContent={initialContent} />
    </EditorProvider>
  );
}

function EditorShellInner({
  projectId,
  initialContent,
}: {
  projectId: string;
  initialContent: string;
}) {
  useKeyboardShortcuts();
  useUndoRedo();
  const { saveState } = useAutoSave(projectId, initialContent);
  const { connectionState, lastOperation, operations, clearOperations } =
    useAgentStream(projectId);
  useAgentHighlight(lastOperation);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left pane: Layers */}
      <LayersPanel />

      {/* Tools toolbar — left edge, between layers and canvas */}
      <ToolsToolbar />

      {/* Canvas area — relative container for overlays */}
      <div className="relative flex-1">
        <EditorCanvas initialContent={initialContent} saveState={saveState} />

        {/* Agent connection status — bottom-left overlay */}
        <div className="pointer-events-none absolute bottom-14 left-3 z-10">
          <AgentStatusIndicator
            connectionState={connectionState}
            lastTool={lastOperation?.tool ?? null}
          />
        </div>

        {/* Agent Activity panel — bottom overlay */}
        <AgentActivityPanel
          operations={operations}
          connectionState={connectionState}
          onClear={clearOperations}
        />
      </div>

      {/* Right pane: Properties */}
      <PropertiesPanel />
    </div>
  );
}
