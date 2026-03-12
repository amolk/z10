"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor, getElementStyles, type ElementStyles } from "@/lib/editor-state";
import { ColorPicker } from "@/components/color-picker";
import { ScrubInput } from "@/components/scrub-input";
import {
  Plus,
  Minus,
  Link2,
  Unlink,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Download,
  Search,
} from "lucide-react";

// ─── Main Panel ──────────────────────────────────────────────

export function PropertiesPanel() {
  const { selectedIds, transformRef, updateElementStyle, activePageId, content, updateContent } = useEditor();
  const [styles, setStyles] = useState<ElementStyles | null>(null);
  const [elementTag, setElementTag] = useState("");

  const refreshStyles = useCallback(() => {
    if (selectedIds.size !== 1) {
      setStyles(null);
      setElementTag("");
      return;
    }
    const id = Array.from(selectedIds)[0];
    const el = transformRef.current?.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
    if (!el) { setStyles(null); return; }
    setElementTag(el.tagName.toLowerCase());
    setStyles(getElementStyles(el));
  }, [selectedIds, transformRef]);

  useEffect(() => {
    const timer = setTimeout(refreshStyles, 50);
    return () => clearTimeout(timer);
  }, [refreshStyles]);

  // Live-update styles during drag/resize via MutationObserver
  useEffect(() => {
    if (selectedIds.size !== 1) return;
    const id = Array.from(selectedIds)[0];
    const el = transformRef.current?.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
    if (!el) return;

    const observer = new MutationObserver(() => {
      setStyles(getElementStyles(el));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [selectedIds, transformRef]);

  const selectedId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;

  const updateStyle = useCallback(
    (prop: string, value: string) => {
      if (!selectedId) return;
      updateElementStyle(selectedId, { [prop]: value });
      setTimeout(refreshStyles, 10);
    },
    [selectedId, updateElementStyle, refreshStyles]
  );

  if (selectedIds.size === 0) {
    return (
      <Panel tag="page">
        <PagePropertiesSection
          activePageId={activePageId}
          transformRef={transformRef}
          updateElementStyle={updateElementStyle}
          content={content}
          updateContent={updateContent}
        />
      </Panel>
    );
  }

  if (selectedIds.size > 1) {
    return (
      <Panel tag="">
        <div className="p-3">
          <AlignmentSection updateStyle={updateStyle} />
          <div className="mt-3 text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>
            {selectedIds.size} elements selected
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel tag={elementTag} elementId={selectedId ?? undefined}>
      {styles && <LayoutSection styles={styles} updateStyle={updateStyle} />}
      {styles && <FrameSection styles={styles} updateStyle={updateStyle} />}
      {styles && <AppearanceSection styles={styles} updateStyle={updateStyle} />}
      {styles && <RadiusSection styles={styles} updateStyle={updateStyle} />}
      {styles && <FillSection styles={styles} updateStyle={updateStyle} />}
      {styles && <StrokeSection styles={styles} updateStyle={updateStyle} />}
      {styles && <ShadowSection styles={styles} updateStyle={updateStyle} type="drop-shadow" />}
      {styles && <ShadowSection styles={styles} updateStyle={updateStyle} type="inner-shadow" />}
      {styles && <TypographySection styles={styles} updateStyle={updateStyle} />}
      {selectedId && <ExportSection elementId={selectedId} />}
    </Panel>
  );
}

// ─── Shell ───────────────────────────────────────────────────

function Panel({ tag, elementId, children }: { tag: string; elementId?: string; children: React.ReactNode }) {
  return (
    <aside
      className="flex w-[260px] flex-col border-l"
      style={{ backgroundColor: "var(--ed-panel-bg)", borderColor: "var(--ed-panel-border)", minHeight: 0 }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2 flex-shrink-0"
        style={{ borderColor: "var(--ed-panel-border)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {tag && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] flex-shrink-0"
              style={{ backgroundColor: "var(--ed-badge-bg)", color: "var(--ed-badge-text)" }}
            >
              {tag}
            </span>
          )}
          {elementId && (
            <span
              className="truncate text-[11px] font-mono"
              style={{ color: "var(--ed-text-tertiary)" }}
              title={elementId}
            >
              {elementId}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {children}
      </div>
    </aside>
  );
}

// ─── Page properties (shown when nothing selected) ──────────

function PagePropertiesSection({
  activePageId,
  transformRef,
  content,
  updateContent,
}: {
  activePageId: string | null;
  transformRef: React.RefObject<HTMLDivElement | null>;
  updateElementStyle: (id: string, styles: Record<string, string>) => void;
  content: string;
  updateContent: (c: string) => void;
}) {
  const [pageName, setPageName] = useState("");
  const [bgColor, setBgColor] = useState("");

  // Read page properties from content model
  useEffect(() => {
    if (!activePageId) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const pageEl = doc.querySelector(`[data-z10-id="${activePageId}"]`);
    if (!pageEl) return;
    setPageName(pageEl.getAttribute("data-z10-page") || "");
    setBgColor(pageEl.getAttribute("data-z10-canvas-bg") || "");
  }, [activePageId, content]);

  const updatePageAttr = useCallback(
    (attr: string, value: string) => {
      if (!activePageId) return;
      // Update live DOM
      const pageEl = transformRef.current?.querySelector(`[data-z10-id="${activePageId}"]`);
      if (pageEl) pageEl.setAttribute(attr, value);
      // Update content model
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const target = doc.querySelector(`[data-z10-id="${activePageId}"]`);
      if (target) {
        target.setAttribute(attr, value);
        updateContent(`<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`);
      }
    },
    [activePageId, transformRef, content, updateContent]
  );

  const handleNameChange = useCallback(
    (name: string) => {
      setPageName(name);
      updatePageAttr("data-z10-page", name);
    },
    [updatePageAttr]
  );

  const handleBgChange = useCallback(
    (color: string) => {
      setBgColor(color);
      updatePageAttr("data-z10-canvas-bg", color);
    },
    [updatePageAttr]
  );

  if (!activePageId) return null;

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      {/* Page name */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium" style={{ color: "var(--ed-text-tertiary)" }}>
          Page Name
        </label>
        <input
          type="text"
          value={pageName}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full rounded px-2 py-1 text-[12px] outline-none"
          style={{
            backgroundColor: "var(--ed-input-bg)",
            border: "1px solid var(--ed-input-border)",
            color: "var(--ed-text)",
          }}
        />
      </div>
      {/* Background color */}
      <div>
        <label className="mb-1 block text-[10px] font-medium" style={{ color: "var(--ed-text-tertiary)" }}>
          Background
        </label>
        <div className="flex items-center gap-2">
          <ColorSwatch color={bgColor || "var(--ed-canvas-bg)"} onChange={handleBgChange} />
          <input
            type="text"
            value={bgColor}
            placeholder="default"
            onChange={(e) => handleBgChange(e.target.value)}
            className="flex-1 rounded px-2 py-1 text-[11px] font-mono outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              border: "1px solid var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Section wrapper with collapse ──────────────────────────

function Section({
  title,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b px-3" style={{ borderColor: "var(--ed-section-border)" }}>
      <div
        className="flex items-center justify-between py-1.5 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-1">
          {open ? (
            <ChevronDown size={10} style={{ color: "var(--ed-text-tertiary)" }} />
          ) : (
            <ChevronRight size={10} style={{ color: "var(--ed-text-tertiary)" }} />
          )}
          <span className="text-[11px] font-medium" style={{ color: "var(--ed-text)" }}>
            {title}
          </span>
        </div>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

// ─── Color Swatch ───────────────────────────────────────────

function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div
        className="h-5 w-5 rounded border cursor-pointer flex-shrink-0"
        style={{ background: color, borderColor: "var(--ed-input-border)" }}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="absolute left-0 top-7 z-50">
          <ColorPicker color={color} onChange={onChange} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ─── Layout (Flex + Position checkboxes) ────────────────────

function LayoutSection({ styles, updateStyle }: StyleProps) {
  const isFlex = styles.display === "flex" || styles.display === "inline-flex";

  // Determine width/height sizing modes
  const getWidthMode = () => {
    if (styles.width === "100%" || styles.width === "auto" && styles.display === "flex") return "fill";
    if (styles.width === "auto" || styles.width === "fit-content") return "fit";
    return "fixed";
  };
  const getHeightMode = () => {
    if (styles.height === "100%") return "fill";
    if (styles.height === "auto" || styles.height === "fit-content") return "fit";
    return "fixed";
  };

  const setWidthMode = (mode: string) => {
    if (mode === "fill") {
      updateStyle("width", "100%");
      updateStyle("box-sizing", "border-box");
    } else if (mode === "fit") {
      updateStyle("width", "fit-content");
    }
    // "fixed" keeps current numeric value
  };
  const setHeightMode = (mode: string) => {
    if (mode === "fill") {
      updateStyle("height", "100%");
      updateStyle("box-sizing", "border-box");
    } else if (mode === "fit") {
      updateStyle("height", "fit-content");
    }
  };

  return (
    <Section title="Layout">
      {/* Width / Height sizing modes */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--ed-text-tertiary)" }}>W</span>
          <SizingModeSelect value={getWidthMode()} numericValue={parseNum(styles.width)} onChange={setWidthMode} onNumericChange={(v) => updateStyle("width", px(v))} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--ed-text-tertiary)" }}>H</span>
          <SizingModeSelect value={getHeightMode()} numericValue={parseNum(styles.height)} onChange={setHeightMode} onNumericChange={(v) => updateStyle("height", px(v))} />
        </div>
      </div>

      {/* Flex controls — only when display is flex */}
      {isFlex && (
        <>
          {/* Direction + wrap */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-0.5">
              {([
                { val: "row", label: "→" },
                { val: "column", label: "↓" },
                { val: "row-reverse", label: "←" },
                { val: "column-reverse", label: "↑" },
              ] as const).map((d) => (
                <button
                  key={d.val}
                  onClick={() => updateStyle("flex-direction", d.val)}
                  className="flex h-6 w-6 items-center justify-center rounded text-[11px] transition-colors"
                  style={{
                    backgroundColor: styles.flexDirection === d.val ? "var(--ed-tool-active-bg)" : "transparent",
                    color: styles.flexDirection === d.val ? "var(--ed-text)" : "var(--ed-icon-color)",
                  }}
                  title={d.val}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {/* 3×3 Alignment Grid */}
            <AlignmentGrid
              alignItems={styles.alignItems}
              justifyContent={styles.justifyContent}
              onChange={(ai, jc) => {
                updateStyle("align-items", ai);
                updateStyle("justify-content", jc);
              }}
            />
            {/* Distribute menu */}
            <DistributeMenu
              justifyContent={styles.justifyContent}
              alignItems={styles.alignItems}
              onChange={(prop, val) => updateStyle(prop, val)}
            />
          </div>

          {/* Gap */}
          <div className="flex items-center gap-2 mb-2">
            <ScrubInput label="Gap" value={parseNum(styles.gap)} onChange={(v) => updateStyle("gap", px(v))} min={0} />
          </div>

          {/* Padding */}
          <div className="grid grid-cols-4 gap-1 mb-2">
            <ScrubInput label="T" value={parseNum(styles.paddingTop)} onChange={(v) => updateStyle("padding-top", px(v))} min={0} />
            <ScrubInput label="R" value={parseNum(styles.paddingRight)} onChange={(v) => updateStyle("padding-right", px(v))} min={0} />
            <ScrubInput label="B" value={parseNum(styles.paddingBottom)} onChange={(v) => updateStyle("padding-bottom", px(v))} min={0} />
            <ScrubInput label="L" value={parseNum(styles.paddingLeft)} onChange={(v) => updateStyle("padding-left", px(v))} min={0} />
          </div>
        </>
      )}

      {/* Clip + Absolute checkboxes */}
      <div className="flex flex-col gap-1 mt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={styles.overflow === "hidden"}
            onChange={(e) => updateStyle("overflow", e.target.checked ? "hidden" : "visible")}
            className="accent-blue-500"
          />
          <span className="text-[11px]" style={{ color: "var(--ed-text-secondary)" }}>
            Clip content
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={styles.position === "absolute"}
            onChange={(e) => updateStyle("position", e.target.checked ? "absolute" : "relative")}
            className="accent-blue-500"
          />
          <span className="text-[11px]" style={{ color: "var(--ed-text-secondary)" }}>
            Absolute position
          </span>
        </label>
      </div>
    </Section>
  );
}

// ─── Width/Height sizing mode selector ─────────────────────

function SizingModeSelect({
  value,
  numericValue,
  onChange,
  onNumericChange,
}: {
  value: string;
  numericValue: string;
  onChange: (mode: string) => void;
  onNumericChange: (v: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const label = value === "fill" ? "Fill" : value === "fit" ? "Fit" : "";

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex h-6 items-center gap-0.5 rounded px-1 text-[10px] transition-colors hover:bg-[var(--ed-hover-bg)]"
          style={{
            color: "var(--ed-text-secondary)",
            backgroundColor: "var(--ed-input-bg)",
            border: "1px solid var(--ed-input-border)",
          }}
        >
          {label || "Fixed"}
          <ChevronDown size={8} />
        </button>
        {value === "fixed" && (
          <div className="flex-1">
            <ScrubInput value={numericValue} onChange={onNumericChange} min={0} inline />
          </div>
        )}
      </div>
      {showDropdown && (
        <div
          className="absolute left-0 top-7 z-50 rounded border py-0.5 shadow-lg"
          style={{
            backgroundColor: "var(--ed-panel-bg)",
            borderColor: "var(--ed-panel-border)",
            minWidth: 130,
          }}
        >
          {[
            { val: "fixed", label: `Fixed${numericValue ? ` (${numericValue})` : ""}` },
            { val: "fill", label: "Fill container" },
            { val: "fit", label: "Fit content" },
          ].map((opt) => (
            <button
              key={opt.val}
              onClick={() => { onChange(opt.val); setShowDropdown(false); }}
              className="flex w-full items-center px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--ed-hover-bg)]"
              style={{
                color: value === opt.val ? "var(--ed-selected-text)" : "var(--ed-text)",
                backgroundColor: value === opt.val ? "var(--ed-selected-bg)" : "transparent",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Distribute/space menu for flex ────────────────────────

function DistributeMenu({
  justifyContent,
  alignItems,
  onChange,
}: {
  justifyContent: string;
  alignItems: string;
  onChange: (prop: string, val: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--ed-hover-bg)]"
        style={{ color: "var(--ed-icon-color)" }}
        title="Distribution"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
          <line x1="1" y1="2" x2="13" y2="2" />
          <line x1="1" y1="12" x2="13" y2="12" />
          <rect x="3" y="5" width="3" height="4" rx="0.5" />
          <rect x="8" y="5" width="3" height="4" rx="0.5" />
        </svg>
      </button>
      {showDropdown && (
        <div
          className="absolute right-0 top-7 z-50 rounded border py-0.5 shadow-lg"
          style={{
            backgroundColor: "var(--ed-panel-bg)",
            borderColor: "var(--ed-panel-border)",
            minWidth: 150,
          }}
        >
          {[
            { label: "Align to baseline", prop: "align-items", val: "baseline" },
            { label: "Space between", prop: "justify-content", val: "space-between" },
            { label: "Space around", prop: "justify-content", val: "space-around" },
            { label: "Space evenly", prop: "justify-content", val: "space-evenly" },
            { label: "Stretch", prop: "align-items", val: "stretch" },
          ].map((opt) => {
            const isActive = (opt.prop === "align-items" ? alignItems : justifyContent) === opt.val;
            return (
              <button
                key={opt.label}
                onClick={() => { onChange(opt.prop, opt.val); setShowDropdown(false); }}
                className="flex w-full items-center px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--ed-hover-bg)]"
                style={{
                  color: isActive ? "var(--ed-selected-text)" : "var(--ed-text)",
                  backgroundColor: isActive ? "var(--ed-selected-bg)" : "transparent",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 3×3 Alignment Grid ─────────────────────────────────────

const ALIGN_MAP: [string, string][] = [
  ["flex-start", "flex-start"], ["flex-start", "center"], ["flex-start", "flex-end"],
  ["center", "flex-start"],     ["center", "center"],     ["center", "flex-end"],
  ["flex-end", "flex-start"],   ["flex-end", "center"],   ["flex-end", "flex-end"],
];

function AlignmentGrid({
  alignItems,
  justifyContent,
  onChange,
}: {
  alignItems: string;
  justifyContent: string;
  onChange: (ai: string, jc: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-[3px]">
      {ALIGN_MAP.map(([ai, jc], i) => {
        const active = alignItems === ai && justifyContent === jc;
        return (
          <button
            key={i}
            onClick={() => onChange(ai, jc)}
            className="h-4 w-4 rounded-sm flex items-center justify-center transition-colors"
            style={{
              backgroundColor: active ? "#3b82f6" : "var(--ed-input-bg)",
              border: `1px solid ${active ? "#3b82f6" : "var(--ed-input-border)"}`,
            }}
            title={`${ai} / ${jc}`}
          >
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: active ? "#fff" : "var(--ed-text-tertiary)" }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Alignment (multi-select) ───────────────────────────────

function AlignmentSection({ updateStyle: _updateStyle }: { updateStyle: (p: string, v: string) => void }) {
  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-medium mr-1" style={{ color: "var(--ed-text)" }}>Align</span>
        {[
          { title: "Left", Icon: AlignHorizontalJustifyStart },
          { title: "Center H", Icon: AlignHorizontalJustifyCenter },
          { title: "Right", Icon: AlignHorizontalJustifyEnd },
          { title: "Top", Icon: AlignVerticalJustifyStart },
          { title: "Center V", Icon: AlignVerticalJustifyCenter },
          { title: "Bottom", Icon: AlignVerticalJustifyEnd },
        ].map(({ title, Icon }) => (
          <button
            key={title}
            title={title}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-icon-color)" }}
          >
            <Icon size={13} strokeWidth={1.5} />
          </button>
        ))}
        <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: "var(--ed-section-border)" }} />
        <button title="Distribute H" className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--ed-hover-bg)]" style={{ color: "var(--ed-icon-color)" }}>
          <AlignHorizontalSpaceAround size={13} strokeWidth={1.5} />
        </button>
        <button title="Distribute V" className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--ed-hover-bg)]" style={{ color: "var(--ed-icon-color)" }}>
          <AlignVerticalSpaceAround size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ─── Frame (dimensions, position, rotation) ─────────────────

function FrameSection({ styles, updateStyle }: StyleProps) {
  const [constrainProportions, setConstrainProportions] = useState(false);

  return (
    <Section title="Frame">
      {/* W / H */}
      <div className="flex items-end gap-1 mb-2">
        <div className="flex-1">
          <ScrubInput label="W" value={parseNum(styles.width)} onChange={(v) => updateStyle("width", px(v))} min={0} />
        </div>
        <button
          onClick={() => setConstrainProportions(!constrainProportions)}
          className="mb-0.5 flex h-5 w-4 items-center justify-center rounded"
          style={{ color: constrainProportions ? "#3b82f6" : "var(--ed-text-tertiary)" }}
          title="Constrain proportions"
        >
          {constrainProportions ? <Link2 size={11} strokeWidth={1.5} /> : <Unlink size={11} strokeWidth={1.5} />}
        </button>
        <div className="flex-1">
          <ScrubInput label="H" value={parseNum(styles.height)} onChange={(v) => updateStyle("height", px(v))} min={0} />
        </div>
      </div>
      {/* X / Y */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <ScrubInput label="X" value={parseNum(styles.x)} onChange={(v) => updateStyle("left", px(v))} />
        <ScrubInput label="Y" value={parseNum(styles.y)} onChange={(v) => updateStyle("top", px(v))} />
      </div>
      {/* Rotation + Flip actions */}
      <div className="flex items-end gap-1">
        <div className="flex-1">
          <ScrubInput label="Rotation" value={parseNum(styles.rotation)} onChange={(v) => updateStyle("rotate", v + "deg")} suffix="°" />
        </div>
        <div className="flex gap-0.5 mb-0.5">
          <button
            onClick={() => {
              const cur = parseFloat(parseNum(styles.rotation)) || 0;
              updateStyle("rotate", (cur + 90) + "deg");
            }}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-icon-color)" }}
            title="Rotate 90°"
          >
            <RotateCw size={11} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => updateStyle("transform", "scaleX(-1)")}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-icon-color)" }}
            title="Flip horizontal"
          >
            <FlipHorizontal size={11} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => updateStyle("transform", "scaleY(-1)")}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-icon-color)" }}
            title="Flip vertical"
          >
            <FlipVertical size={11} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── Appearance (opacity, blend mode, visibility) ───────────

function AppearanceSection({ styles, updateStyle }: StyleProps) {
  return (
    <Section title="Appearance">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <ScrubInput
            label="Opacity"
            value={String(Math.round(parseFloat(styles.opacity) * 100))}
            onChange={(v) => updateStyle("opacity", String(parseInt(v) / 100))}
            suffix="%"
            min={0}
            max={100}
          />
        </div>
        <button
          onClick={() => updateStyle("visibility", styles.visibility === "hidden" ? "visible" : "hidden")}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
          style={{ color: styles.visibility === "hidden" ? "var(--ed-text-tertiary)" : "var(--ed-icon-color)" }}
          title="Toggle visibility"
        >
          {styles.visibility === "hidden" ? <EyeOff size={13} strokeWidth={1.5} /> : <Eye size={13} strokeWidth={1.5} />}
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Blend mode</span>
        <select
          value={styles.mixBlendMode}
          onChange={(e) => updateStyle("mix-blend-mode", e.target.value)}
          className="rounded px-1.5 py-1 text-[11px] focus:outline-none"
          style={{
            backgroundColor: "var(--ed-input-bg)",
            border: "1px solid var(--ed-input-border)",
            color: "var(--ed-text)",
          }}
        >
          {["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"].map((m) => (
            <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1).replace("-", " ")}</option>
          ))}
        </select>
      </div>
    </Section>
  );
}

// ─── Radius (individual corners) ────────────────────────────

function RadiusSection({ styles, updateStyle }: StyleProps) {
  const [expanded, setExpanded] = useState(false);
  const [linked, setLinked] = useState(true);

  const allSame =
    styles.borderTopLeftRadius === styles.borderTopRightRadius &&
    styles.borderTopRightRadius === styles.borderBottomRightRadius &&
    styles.borderBottomRightRadius === styles.borderBottomLeftRadius;

  if (!expanded && !allSame) setExpanded(true);

  const handleUnifiedChange = (v: string) => {
    const val = px(v);
    updateStyle("border-radius", val);
  };

  const handleCornerChange = (corner: string, v: string) => {
    if (linked) {
      handleUnifiedChange(v);
    } else {
      updateStyle(corner, px(v));
    }
  };

  return (
    <Section title="Radius">
      {!expanded ? (
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <ScrubInput
              value={parseNum(styles.borderRadius)}
              onChange={handleUnifiedChange}
              min={0}
              inline
            />
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-text-tertiary)" }}
            title="Individual corners"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="0.5" y="0.5" width="10" height="10" rx="3" stroke="currentColor" strokeDasharray="2 2" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <div className="grid grid-cols-4 gap-1 flex-1">
            <ScrubInput label="TL" value={parseNum(styles.borderTopLeftRadius)} onChange={(v) => handleCornerChange("border-top-left-radius", v)} min={0} />
            <ScrubInput label="TR" value={parseNum(styles.borderTopRightRadius)} onChange={(v) => handleCornerChange("border-top-right-radius", v)} min={0} />
            <ScrubInput label="BR" value={parseNum(styles.borderBottomRightRadius)} onChange={(v) => handleCornerChange("border-bottom-right-radius", v)} min={0} />
            <ScrubInput label="BL" value={parseNum(styles.borderBottomLeftRadius)} onChange={(v) => handleCornerChange("border-bottom-left-radius", v)} min={0} />
          </div>
          <button
            onClick={() => setLinked(!linked)}
            className="flex h-5 w-4 items-center justify-center rounded"
            style={{ color: linked ? "#3b82f6" : "var(--ed-text-tertiary)" }}
            title={linked ? "Unlink corners" : "Link corners"}
          >
            {linked ? <Link2 size={11} strokeWidth={1.5} /> : <Unlink size={11} strokeWidth={1.5} />}
          </button>
        </div>
      )}
    </Section>
  );
}

// ─── Fill ───────────────────────────────────────────────────

function FillSection({ styles, updateStyle }: StyleProps) {
  const [mode, setMode] = useState<"solid" | "gradient">("solid");
  const fill = styles.fills[0];

  return (
    <Section
      title="Fill"
      action={
        <button
          onClick={() => { if (!fill) updateStyle("background-color", "#cccccc"); }}
          style={{ color: "var(--ed-icon-color)" }}
          title="Add fill"
        >
          <Plus size={11} strokeWidth={1.5} />
        </button>
      }
    >
      {/* Solid / Gradient toggle */}
      <div className="flex gap-0.5 mb-2">
        {(["solid", "gradient"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: mode === m ? "var(--ed-tool-active-bg)" : "transparent",
              color: mode === m ? "var(--ed-text)" : "var(--ed-text-tertiary)",
            }}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {mode === "solid" && fill ? (
        <div className="flex items-center gap-2">
          <ColorSwatch color={fill.color} onChange={(c) => updateStyle("background-color", c)} />
          <input
            type="text"
            value={rgbToHex(fill.color)}
            onChange={(e) => updateStyle("background-color", e.target.value)}
            className="flex-1 rounded border px-1.5 py-0.5 font-mono text-[11px] focus:outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              borderColor: "var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          />
        </div>
      ) : mode === "solid" ? (
        <div className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>No fill</div>
      ) : (
        <GradientEditor styles={styles} updateStyle={updateStyle} />
      )}
    </Section>
  );
}

// ─── Gradient Editor ────────────────────────────────────────

function GradientEditor({ styles: _styles, updateStyle }: StyleProps) {
  const [gradientType, setGradientType] = useState<"linear" | "radial" | "conic">("linear");
  const [angle, setAngle] = useState("180");
  const [stops, setStops] = useState([
    { color: "#000000", position: 0 },
    { color: "#ffffff", position: 100 },
  ]);

  const buildGradient = useCallback(
    (s: typeof stops, type: string, a: string) => {
      const stopStr = s.map((st) => `${st.color} ${st.position}%`).join(", ");
      if (type === "radial") return `radial-gradient(circle, ${stopStr})`;
      if (type === "conic") return `conic-gradient(from ${a}deg, ${stopStr})`;
      return `linear-gradient(${a}deg, ${stopStr})`;
    },
    []
  );

  const applyGradient = useCallback(
    (s: typeof stops, type: string, a: string) => {
      updateStyle("background", buildGradient(s, type, a));
    },
    [updateStyle, buildGradient]
  );

  return (
    <div className="space-y-2">
      {/* Type selector */}
      <div className="flex gap-0.5">
        {(["linear", "radial", "conic"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setGradientType(t);
              applyGradient(stops, t, angle);
            }}
            className="flex-1 rounded px-1 py-0.5 text-[10px] transition-colors"
            style={{
              backgroundColor: gradientType === t ? "var(--ed-tool-active-bg)" : "transparent",
              color: gradientType === t ? "var(--ed-text)" : "var(--ed-text-tertiary)",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Angle */}
      {gradientType !== "radial" && (
        <ScrubInput label="Angle" value={angle} onChange={(v) => { setAngle(v); applyGradient(stops, gradientType, v); }} suffix="°" inline />
      )}

      {/* Gradient preview bar */}
      <div
        className="h-4 rounded border"
        style={{
          background: buildGradient(stops, gradientType, angle),
          borderColor: "var(--ed-input-border)",
        }}
      />

      {/* Stops */}
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-1">
          <ColorSwatch
            color={stop.color}
            onChange={(c) => {
              const next = [...stops];
              next[i] = { ...next[i], color: c };
              setStops(next);
              applyGradient(next, gradientType, angle);
            }}
          />
          <ScrubInput
            value={String(stop.position)}
            onChange={(v) => {
              const next = [...stops];
              next[i] = { ...next[i], position: parseInt(v) || 0 };
              setStops(next);
              applyGradient(next, gradientType, angle);
            }}
            suffix="%"
            min={0}
            max={100}
            inline
            className="flex-1"
          />
          {stops.length > 2 && (
            <button
              onClick={() => {
                const next = stops.filter((_, j) => j !== i);
                setStops(next);
                applyGradient(next, gradientType, angle);
              }}
              style={{ color: "var(--ed-icon-color)" }}
            >
              <Minus size={11} />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={() => {
          const next = [...stops, { color: "#888888", position: 50 }].sort((a, b) => a.position - b.position);
          setStops(next);
          applyGradient(next, gradientType, angle);
        }}
        className="flex items-center gap-1 text-[10px] hover:underline"
        style={{ color: "var(--ed-text-tertiary)" }}
      >
        <Plus size={10} /> Add stop
      </button>
    </div>
  );
}

// ─── Stroke / Outline ───────────────────────────────────────

function StrokeSection({ styles, updateStyle }: StyleProps) {
  const hasStroke = styles.stroke.style !== "none" && styles.stroke.width !== "0px";

  return (
    <Section
      title="Outline"
      action={
        <button
          onClick={() => { if (!hasStroke) updateStyle("border", "1px solid #000000"); }}
          style={{ color: "var(--ed-icon-color)" }}
          title="Add stroke"
        >
          <Plus size={11} strokeWidth={1.5} />
        </button>
      }
    >
      {hasStroke ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ColorSwatch color={styles.stroke.color} onChange={(c) => updateStyle("border-color", c)} />
            <input
              type="text"
              value={rgbToHex(styles.stroke.color)}
              onChange={(e) => updateStyle("border-color", e.target.value)}
              className="flex-1 rounded border px-1.5 py-0.5 font-mono text-[11px] focus:outline-none"
              style={{
                backgroundColor: "var(--ed-input-bg)",
                borderColor: "var(--ed-input-border)",
                color: "var(--ed-text)",
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-1">
            <ScrubInput label="Width" value={parseNum(styles.stroke.width)} onChange={(v) => updateStyle("border-width", px(v))} min={0} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Style</span>
              <select
                value={styles.stroke.style}
                onChange={(e) => updateStyle("border-style", e.target.value)}
                className="rounded px-1 py-0.5 text-[11px] focus:outline-none"
                style={{
                  backgroundColor: "var(--ed-input-bg)",
                  border: "1px solid var(--ed-input-border)",
                  color: "var(--ed-text)",
                }}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Pos</span>
              <select
                value="inside"
                onChange={() => {}}
                className="rounded px-1 py-0.5 text-[11px] focus:outline-none"
                style={{
                  backgroundColor: "var(--ed-input-bg)",
                  border: "1px solid var(--ed-input-border)",
                  color: "var(--ed-text)",
                }}
              >
                <option value="inside">Inside</option>
                <option value="center">Center</option>
                <option value="outside">Outside</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>No outline</div>
      )}
    </Section>
  );
}

// ─── Shadow (drop + inner) ──────────────────────────────────

function ShadowSection({
  styles,
  updateStyle,
  type,
}: StyleProps & { type: "drop-shadow" | "inner-shadow" }) {
  const title = type === "inner-shadow" ? "Inner shadow" : "Shadow";
  const shadows = styles.effects.filter((e) => e.type === type);

  const rebuildShadow = (effects: ElementStyles["effects"]) => {
    const all = effects
      .filter((e) => e.enabled)
      .map((e) => {
        const inset = e.type === "inner-shadow" ? "inset " : "";
        return `${inset}${e.x}px ${e.y}px ${e.blur}px ${e.spread}px ${e.color}`;
      });
    updateStyle("box-shadow", all.length ? all.join(", ") : "none");
  };

  const addShadow = () => {
    const newEffect: ElementStyles["effects"][0] = {
      type,
      enabled: true,
      x: "0",
      y: type === "inner-shadow" ? "2" : "2",
      blur: "4",
      spread: "0",
      color: "rgba(0,0,0,0.25)",
    };
    rebuildShadow([...styles.effects, newEffect]);
  };

  const updateShadowProp = (idx: number, prop: string, val: string) => {
    const typeEffects = styles.effects.filter((e) => e.type === type);
    const otherEffects = styles.effects.filter((e) => e.type !== type);
    const updated = [...typeEffects];
    updated[idx] = { ...updated[idx], [prop]: val };
    rebuildShadow([...otherEffects, ...updated]);
  };

  const removeShadow = (idx: number) => {
    const typeEffects = styles.effects.filter((e) => e.type === type);
    const otherEffects = styles.effects.filter((e) => e.type !== type);
    typeEffects.splice(idx, 1);
    rebuildShadow([...otherEffects, ...typeEffects]);
  };

  return (
    <Section
      title={title}
      action={
        <button onClick={addShadow} style={{ color: "var(--ed-icon-color)" }} title={`Add ${title.toLowerCase()}`}>
          <Plus size={11} strokeWidth={1.5} />
        </button>
      }
    >
      {shadows.length > 0 ? (
        <div className="space-y-2">
          {shadows.map((shadow, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1">
                <ScrubInput label="X" value={shadow.x} onChange={(v) => updateShadowProp(i, "x", v)} inline className="flex-1" />
                <ScrubInput label="Y" value={shadow.y} onChange={(v) => updateShadowProp(i, "y", v)} inline className="flex-1" />
                <ScrubInput label="B" value={shadow.blur} onChange={(v) => updateShadowProp(i, "blur", v)} min={0} inline className="flex-1" />
                <ScrubInput label="S" value={shadow.spread} onChange={(v) => updateShadowProp(i, "spread", v)} inline className="flex-1" />
                <button
                  onClick={() => updateShadowProp(i, "enabled", String(!shadow.enabled))}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
                  style={{ color: shadow.enabled ? "var(--ed-icon-color)" : "var(--ed-text-tertiary)" }}
                >
                  {shadow.enabled ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
                <button
                  onClick={() => removeShadow(i)}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
                  style={{ color: "var(--ed-icon-color)" }}
                >
                  <Minus size={11} />
                </button>
              </div>
              <div className="flex items-center gap-2 pl-0.5">
                <ColorSwatch color={shadow.color} onChange={(c) => updateShadowProp(i, "color", c)} />
                <input
                  type="text"
                  value={shadow.color}
                  onChange={(e) => updateShadowProp(i, "color", e.target.value)}
                  className="flex-1 rounded border px-1.5 py-0.5 font-mono text-[11px] focus:outline-none"
                  style={{
                    backgroundColor: "var(--ed-input-bg)",
                    borderColor: "var(--ed-input-border)",
                    color: "var(--ed-text)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>
          No {title.toLowerCase()}
        </div>
      )}
    </Section>
  );
}

// ─── Typography ─────────────────────────────────────────────

function TypographySection({ styles, updateStyle }: StyleProps) {
  return (
    <Section title="Text">
      <div className="space-y-2">
        {/* Font family dropdown */}
        <FontFamilyPicker
          value={styles.fontFamily.replace(/"/g, "")}
          onChange={(f) => updateStyle("font-family", f)}
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Weight</span>
            <select
              value={styles.fontWeight}
              onChange={(e) => updateStyle("font-weight", e.target.value)}
              className="rounded px-1.5 py-0.5 text-[11px] focus:outline-none"
              style={{
                backgroundColor: "var(--ed-input-bg)",
                border: "1px solid var(--ed-input-border)",
                color: "var(--ed-text)",
              }}
            >
              {[
                ["100", "Thin"], ["200", "Extra Light"], ["300", "Light"], ["400", "Regular"],
                ["500", "Medium"], ["600", "Semi Bold"], ["700", "Bold"], ["800", "Extra Bold"], ["900", "Black"],
              ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <ScrubInput label="Size" value={parseNum(styles.fontSize)} onChange={(v) => updateStyle("font-size", px(v))} min={1} />
        </div>
        <div className="grid grid-cols-3 gap-1">
          <ScrubInput label="Line ht" value={parseNum(styles.lineHeight)} onChange={(v) => updateStyle("line-height", px(v))} min={0} />
          <ScrubInput label="Tracking" value={parseNum(styles.letterSpacing)} onChange={(v) => updateStyle("letter-spacing", px(v))} />
          <ScrubInput label="Indent" value="0" onChange={() => {}} min={0} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Align</span>
          <div className="flex gap-0.5">
            {(["left", "center", "right", "justify"] as const).map((align) => (
              <button
                key={align}
                onClick={() => updateStyle("text-align", align)}
                className="flex h-5 w-6 items-center justify-center rounded text-[11px] transition-colors"
                style={{
                  backgroundColor: styles.textAlign === align ? "var(--ed-tool-active-bg)" : "transparent",
                  color: styles.textAlign === align ? "var(--ed-text)" : "var(--ed-icon-color)",
                }}
                title={align}
              >
                <TextAlignIcon align={align} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Color</span>
          <ColorSwatch color={styles.color} onChange={(c) => updateStyle("color", c)} />
          <input
            type="text"
            value={rgbToHex(styles.color)}
            onChange={(e) => updateStyle("color", e.target.value)}
            className="flex-1 rounded border px-1.5 py-0.5 font-mono text-[11px] focus:outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              borderColor: "var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          />
        </div>
      </div>
    </Section>
  );
}

// ─── Font Family Picker (searchable dropdown) ──────────────

const COMMON_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Source Sans Pro", "Nunito", "Raleway", "Ubuntu", "Merriweather",
  "Playfair Display", "DM Sans", "Space Grotesk", "IBM Plex Sans",
  "Fira Sans", "Noto Sans", "Work Sans", "Outfit", "Manrope",
  "JetBrains Mono", "Fira Code", "Source Code Pro", "IBM Plex Mono",
  "system-ui", "Arial", "Helvetica", "Georgia", "Times New Roman",
  "Verdana", "Trebuchet MS", "Courier New",
];

function FontFamilyPicker({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setSearch("");
    }
  }, [open]);

  const filtered = COMMON_FONTS.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-[11px] focus:outline-none"
        style={{
          backgroundColor: "var(--ed-input-bg)",
          border: "1px solid var(--ed-input-border)",
          color: "var(--ed-text)",
        }}
      >
        <Search size={10} style={{ color: "var(--ed-text-tertiary)", flexShrink: 0 }} />
        <span className="flex-1 text-left truncate" style={{ fontFamily: value }}>
          {value || "Select font"}
        </span>
        <ChevronDown size={10} style={{ color: "var(--ed-text-tertiary)" }} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-8 z-50 flex flex-col rounded border shadow-lg"
          style={{
            backgroundColor: "var(--ed-panel-bg)",
            borderColor: "var(--ed-panel-border)",
            width: 220,
            maxHeight: 280,
          }}
        >
          <div className="flex items-center gap-1 border-b px-2 py-1.5" style={{ borderColor: "var(--ed-section-border)" }}>
            <Search size={12} style={{ color: "var(--ed-text-tertiary)" }} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts..."
              className="flex-1 bg-transparent text-[11px] focus:outline-none"
              style={{ color: "var(--ed-text)" }}
            />
          </div>
          <div className="flex-1 overflow-y-auto py-0.5">
            {filtered.map((font) => (
              <button
                key={font}
                onClick={() => { onChange(font); setOpen(false); }}
                className="flex w-full items-center px-2.5 py-1.5 text-[12px] transition-colors hover:bg-[var(--ed-hover-bg)]"
                style={{
                  color: value === font ? "var(--ed-selected-text)" : "var(--ed-text)",
                  backgroundColor: value === font ? "var(--ed-selected-bg)" : "transparent",
                  fontFamily: font,
                }}
              >
                {font}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2.5 py-2 text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>
                No matching fonts
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TextAlignIcon({ align }: { align: string }) {
  const props = { size: 11, strokeWidth: 1.5 };
  switch (align) {
    case "left": return <AlignLeft {...props} />;
    case "center": return <AlignCenter {...props} />;
    case "right": return <AlignRight {...props} />;
    case "justify": return <AlignJustify {...props} />;
    default: return null;
  }
}

// ─── Export Section ─────────────────────────────────────────

function ExportSection({ elementId }: { elementId: string }) {
  const [exports, setExports] = useState<{ scale: string; format: string }[]>([]);
  const { transformRef } = useEditor();

  const addExport = () => {
    setExports((prev) => [...prev, { scale: "2x", format: "PNG" }]);
  };

  const removeExport = (idx: number) => {
    setExports((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateExport = (idx: number, field: string, val: string) => {
    setExports((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const el = transformRef.current?.querySelector(`[data-z10-id="${elementId}"]`) as HTMLElement | null;
    if (!el || exports.length === 0) return;
    setExporting(true);

    try {
      for (const exp of exports) {
        const scaleNum = parseFloat(exp.scale) || 2;
        const width = el.offsetWidth;
        const height = el.offsetHeight;

        if (exp.format === "SVG") {
          // SVG export: clone with computed styles inlined
          const clone = cloneWithComputedStyles(el);
          const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
            <foreignObject width="100%" height="100%">
              <div xmlns="http://www.w3.org/1999/xhtml">${clone.outerHTML}</div>
            </foreignObject>
          </svg>`;
          const blob = new Blob([svgData], { type: "image/svg+xml" });
          downloadBlob(blob, `${elementId}@${exp.scale}.svg`);
          continue;
        }

        // Raster export: render via SVG foreignObject → Canvas for pixel-perfect output
        const clone = cloneWithComputedStyles(el);
        // Reset any position/transform so it renders at origin
        clone.style.position = "relative";
        clone.style.left = "0";
        clone.style.top = "0";
        clone.style.margin = "0";

        // Encode as XML-safe string, then use a data: URL to avoid tainting the canvas
        const xmlSerializer = new XMLSerializer();
        const xhtmlStr = xmlSerializer.serializeToString(
          new DOMParser().parseFromString(clone.outerHTML, "text/html").body
        );
        const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">${xhtmlStr}</foreignObject>
        </svg>`;

        const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;

        const img = new Image();
        img.width = width;
        img.height = height;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = svgDataUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scaleNum);
        canvas.height = Math.round(height * scaleNum);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.scale(scaleNum, scaleNum);
        ctx.drawImage(img, 0, 0);

        let mimeType = "image/png";
        let ext = "png";
        if (exp.format === "JPG") { mimeType = "image/jpeg"; ext = "jpg"; }
        else if (exp.format === "WebP") { mimeType = "image/webp"; ext = "webp"; }

        canvas.toBlob((blob) => {
          if (!blob) return;
          downloadBlob(blob, `${elementId}@${exp.scale}.${ext}`);
        }, mimeType, 0.95);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Section
      title="Export"
      action={
        <button onClick={addExport} style={{ color: "var(--ed-icon-color)" }} title="Add export">
          <Plus size={11} strokeWidth={1.5} />
        </button>
      }
    >
      {exports.length > 0 ? (
        <div className="space-y-2">
          {exports.map((exp, i) => (
            <div key={i} className="flex items-center gap-1">
              <select
                value={exp.scale}
                onChange={(e) => updateExport(i, "scale", e.target.value)}
                className="rounded px-1 py-0.5 text-[11px] focus:outline-none"
                style={{
                  backgroundColor: "var(--ed-input-bg)",
                  border: "1px solid var(--ed-input-border)",
                  color: "var(--ed-text)",
                  flex: 1,
                }}
              >
                <option value="0.5x">0.5x</option>
                <option value="1x">1x</option>
                <option value="2x">2x</option>
                <option value="3x">3x</option>
                <option value="4x">4x</option>
              </select>
              <select
                value={exp.format}
                onChange={(e) => updateExport(i, "format", e.target.value)}
                className="rounded px-1 py-0.5 text-[11px] focus:outline-none"
                style={{
                  backgroundColor: "var(--ed-input-bg)",
                  border: "1px solid var(--ed-input-border)",
                  color: "var(--ed-text)",
                  flex: 1,
                }}
              >
                <option value="PNG">PNG</option>
                <option value="JPG">JPG</option>
                <option value="SVG">SVG</option>
                <option value="WebP">WebP</option>
              </select>
              <button
                onClick={() => removeExport(i)}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ed-hover-bg)]"
                style={{ color: "var(--ed-icon-color)" }}
              >
                <Minus size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex w-full items-center justify-center gap-1.5 rounded py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--ed-tool-active-bg)",
              color: "var(--ed-text)",
            }}
          >
            <Download size={12} strokeWidth={1.5} />
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      ) : (
        <div className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>
          Click + to add export preset
        </div>
      )}
    </Section>
  );
}

// ─── Utils ──────────────────────────────────────────────────

type StyleProps = {
  styles: ElementStyles;
  updateStyle: (prop: string, value: string) => void;
};

function parseNum(value: string): string {
  if (!value || value === "auto" || value === "normal" || value === "none") return value;
  const match = value.match(/^(-?[\d.]+)/);
  return match ? match[1] : value;
}

function px(value: string): string {
  if (!value) return "0px";
  if (/^-?\d+(\.\d+)?$/.test(value)) return value + "px";
  return value;
}

function rgbToHex(color: string): string {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color;
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return "#000000";
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

// ─── Export helpers ──────────────────────────────────────────

/** Deep-clone an element with all computed styles inlined for pixel-perfect export */
function cloneWithComputedStyles(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  inlineComputedStyles(el, clone);
  return clone;
}

function inlineComputedStyles(source: HTMLElement, target: HTMLElement) {
  const computed = window.getComputedStyle(source);
  // Apply all computed styles as inline styles
  const cssText: string[] = [];
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    cssText.push(`${prop}:${computed.getPropertyValue(prop)}`);
  }
  target.setAttribute("style", cssText.join(";"));

  // Recurse into children
  const sourceChildren = source.children;
  const targetChildren = target.children;
  for (let i = 0; i < sourceChildren.length && i < targetChildren.length; i++) {
    if (sourceChildren[i] instanceof HTMLElement && targetChildren[i] instanceof HTMLElement) {
      inlineComputedStyles(sourceChildren[i] as HTMLElement, targetChildren[i] as HTMLElement);
    }
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
