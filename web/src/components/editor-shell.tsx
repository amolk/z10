"use client";

import Link from "next/link";
import { EditorProvider } from "@/lib/editor-state";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { useMutationBridge } from "@/lib/use-mutation-bridge";
import { useUndoRedo } from "@/lib/use-undo-redo";
import { usePatchStream } from "@/lib/use-patch-stream";
import { useCanvasPatchReplay } from "@/lib/use-canvas-patch-replay";
import { useTransact } from "@/lib/use-transact";
import { useEditBridge } from "@/lib/use-edit-bridge";
import { ToolsToolbar } from "@/components/tools-toolbar";
import { LayersPanel } from "@/components/layers-panel";
import { AssetsPanel } from "@/components/assets-panel";
import { EditorCanvas } from "@/components/editor-canvas";
import { PropertiesPanel } from "@/components/properties-panel";
import { ConnectAgentButton } from "@/components/connect-agent-button";
import { useEditor } from "@/lib/editor-state";
import { PanelLeft, PanelRight, Sun, Moon } from "lucide-react";
import { useRef, useEffect } from "react";
import { parseComponentTemplates } from "@/lib/z10-dom";

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
    <EditorProvider projectId={projectId} initialContent={initialContent}>
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
  const {
    content,
    transformRef,
    updateContent,
    updateElementStyle,
    refreshLayersFromDOM,
    validateSelection,
    undoSuppressRef,
    setOnStyleEdit,
    activePageId,
    editingComponentName,
    enterComponentEditMode,
    exitComponentEditMode,
    componentList,
    leftTab,
    setLeftTab,
    leftPanelVisible,
    rightPanelVisible,
    setLeftPanelVisible,
    setRightPanelVisible,
    isDarkMode,
    toggleDarkMode,
  } = useEditor();

  // Parse component templates from content for template expansion.
  // Re-parse when content changes (e.g., agent creates new components).
  const componentTemplatesRef = useRef(parseComponentTemplates(initialContent));
  useEffect(() => {
    if (content) {
      componentTemplatesRef.current = parseComponentTemplates(content);
    }
  }, [content]);

  // D4: Server transaction hook — sends human edits to POST /transact
  const { transact, isOwnTx } = useTransact(projectId);

  // D4: Edit bridge — wires updateElementStyle to send code to server
  useEditBridge(updateElementStyle, transact, activePageId, setOnStyleEdit);

  // Mutation bridge — sends keyboard shortcut DOM mutations to server via transact.
  // Replaces the old useAutoSave PUT path. Also handles Cmd+S flush + beforeunload.
  useMutationBridge(projectId, transact);

  // D2+D3: Patch replay — applies ops directly to canvas DOM via replayPatch(A15),
  // then refreshes layers panel from live DOM
  // D5: validateSelection clears stale selected IDs after agent patches
  const { handlePatch, handleResync } = useCanvasPatchReplay(
    transformRef,
    updateContent,
    refreshLayersFromDOM,
    validateSelection,
    undoSuppressRef,
    componentTemplatesRef,
  );

  // D1+D4: Patch-based real-time connection with self-dedup
  const { connectionState } = usePatchStream(
    projectId,
    handlePatch,
    handleResync,
    isOwnTx,
  );

  // leftTab and setLeftTab now come from editor context

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
        {leftPanelVisible && (
          <div
            className="flex min-h-0 flex-col border-r"
            style={{
              width: 260,
              backgroundColor: "var(--ed-panel-bg)",
              borderColor: "var(--ed-panel-border)",
            }}
          >
            {/* Layers / Assets tab bar */}
            <div
              className="flex border-b text-[11px]"
              style={{ borderColor: "var(--ed-panel-border)" }}
            >
              <button
                onClick={() => {
                  setLeftTab("pages");
                  exitComponentEditMode();
                }}
                className="flex-1 py-1.5 text-center transition-colors"
                style={{
                  color: leftTab === "pages" ? "var(--ed-text)" : "var(--ed-text-tertiary)",
                  borderBottom: leftTab === "pages" ? "2px solid var(--ed-text)" : "2px solid transparent",
                }}
              >
                Pages
              </button>
              <button
                onClick={() => {
                  setLeftTab("assets");
                  // Auto-select first component if none is selected
                  if (!editingComponentName && componentList.length > 0) {
                    enterComponentEditMode(componentList[0]!);
                  }
                }}
                className="flex-1 py-1.5 text-center transition-colors"
                style={{
                  color: leftTab === "assets" ? "var(--ed-text)" : "var(--ed-text-tertiary)",
                  borderBottom: leftTab === "assets" ? "2px solid var(--ed-text)" : "2px solid transparent",
                }}
              >
                Assets
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {leftTab === "pages" ? <LayersPanel /> : <AssetsPanel />}
            </div>
          </div>
        )}
        <ToolsToolbar />

        <div className="relative flex-1">
          <EditorCanvas projectId={projectId} initialContent={initialContent} />
        </div>

        {rightPanelVisible && <PropertiesPanel />}
      </div>
    </div>
  );
}
