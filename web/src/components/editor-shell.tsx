"use client";

import Link from "next/link";
import { EditorProvider } from "@/lib/editor-state";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { useAutoSave } from "@/lib/use-auto-save";
import { useUndoRedo } from "@/lib/use-undo-redo";
import { usePatchStream } from "@/lib/use-patch-stream";
import { useCanvasPatchReplay } from "@/lib/use-canvas-patch-replay";
import { useTransact } from "@/lib/use-transact";
import { useEditBridge } from "@/lib/use-edit-bridge";
import { ToolsToolbar } from "@/components/tools-toolbar";
import { LayersPanel } from "@/components/layers-panel";
import { EditorCanvas } from "@/components/editor-canvas";
import { PropertiesPanel } from "@/components/properties-panel";
import { ConnectAgentButton } from "@/components/connect-agent-button";
import { useEditor } from "@/lib/editor-state";
import { PanelLeft, PanelRight, Sun, Moon } from "lucide-react";

export function EditorShell({
  projectId,
  projectName,
  initialContent,
}: {
  projectId: string;
  projectName: string;
  initialContent: string;
}) {
  return (
    <EditorProvider initialContent={initialContent}>
      <EditorShellInner
        projectId={projectId}
        projectName={projectName}
        initialContent={initialContent}
      />
    </EditorProvider>
  );
}

function EditorShellInner({
  projectId,
  projectName,
  initialContent,
}: {
  projectId: string;
  projectName: string;
  initialContent: string;
}) {
  useKeyboardShortcuts();
  useUndoRedo();
  const { saveState } = useAutoSave(projectId, initialContent);
  const {
    transformRef,
    updateContent,
    updateElementStyle,
    refreshLayersFromDOM,
    validateSelection,
    setOnStyleEdit,
    activePageId,
    leftPanelVisible,
    rightPanelVisible,
    setLeftPanelVisible,
    setRightPanelVisible,
    isDarkMode,
    toggleDarkMode,
  } = useEditor();

  // D4: Server transaction hook — sends human edits to POST /transact
  const { transact, isOwnTx } = useTransact(projectId);

  // D4: Edit bridge — wires updateElementStyle to send code to server
  useEditBridge(updateElementStyle, transact, activePageId, setOnStyleEdit);

  // D2+D3: Patch replay — applies ops directly to canvas DOM via replayPatch(A15),
  // then refreshes layers panel from live DOM
  // D5: validateSelection clears stale selected IDs after agent patches
  const { handlePatch, handleResync } = useCanvasPatchReplay(
    transformRef,
    updateContent,
    refreshLayersFromDOM,
    validateSelection,
  );

  // D1+D4: Patch-based real-time connection with self-dedup
  const { connectionState } = usePatchStream(
    projectId,
    handlePatch,
    handleResync,
    isOwnTx,
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between border-b px-4 py-1.5"
        style={{
          backgroundColor: "var(--ed-panel-bg)",
          borderColor: "var(--ed-panel-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-[12px] transition-colors hover:text-[var(--ed-text)]"
            style={{ color: "var(--ed-text-secondary)" }}
          >
            ← Zero10
          </Link>
          <span style={{ color: "var(--ed-panel-border)" }}>|</span>
          <span className="text-[13px] font-medium" style={{ color: "var(--ed-text)" }}>
            {projectName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Panel toggles */}
          <button
            onClick={() => setLeftPanelVisible(!leftPanelVisible)}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--ed-hover-bg)]"
            style={{
              color: leftPanelVisible ? "var(--ed-text)" : "var(--ed-text-tertiary)",
            }}
            title="Toggle layers panel"
          >
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setRightPanelVisible(!rightPanelVisible)}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--ed-hover-bg)]"
            style={{
              color: rightPanelVisible ? "var(--ed-text)" : "var(--ed-text-tertiary)",
            }}
            title="Toggle properties panel"
          >
            <PanelRight size={16} strokeWidth={1.5} />
          </button>
          <div className="mx-1 h-4 w-px" style={{ backgroundColor: "var(--ed-panel-border)" }} />
          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-text-secondary)" }}
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          </button>
          <div className="mx-1 h-4 w-px" style={{ backgroundColor: "var(--ed-panel-border)" }} />
          <ConnectAgentButton
            projectId={projectId}
            connectionState={connectionState}
            lastTool={null}
          />
        </div>
      </header>

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden">
        {leftPanelVisible && <LayersPanel />}
        <ToolsToolbar />

        <div className="relative flex-1">
          <EditorCanvas initialContent={initialContent} saveState={saveState} />
        </div>

        {rightPanelVisible && <PropertiesPanel />}
      </div>
    </div>
  );
}
