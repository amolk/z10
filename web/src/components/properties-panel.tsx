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
} from "lucide-react";

// ─── Main Panel ──────────────────────────────────────────────

export function PropertiesPanel() {
  const { selectedIds, transformRef, updateElementStyle } = useEditor();
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
      <Panel tag="">
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>
            Select an element to view properties
          </p>
        </div>
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
    <Panel tag={elementTag}>
      {styles && <LayoutSection styles={styles} updateStyle={updateStyle} />}
      {styles && <FrameSection styles={styles} updateStyle={updateStyle} />}
      {styles && <AppearanceSection styles={styles} updateStyle={updateStyle} />}
      {styles && <RadiusSection styles={styles} updateStyle={updateStyle} />}
      {styles && <FillSection styles={styles} updateStyle={updateStyle} />}
      {styles && <StrokeSection styles={styles} updateStyle={updateStyle} />}
      {styles && <ShadowSection styles={styles} updateStyle={updateStyle} type="drop-shadow" />}
      {styles && <ShadowSection styles={styles} updateStyle={updateStyle} type="inner-shadow" />}
      {styles && <TypographySection styles={styles} updateStyle={updateStyle} />}
    </Panel>
  );
}

// ─── Shell ───────────────────────────────────────────────────

function Panel({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <aside
      className="flex w-[260px] flex-col border-l overflow-hidden"
      style={{ backgroundColor: "var(--ed-panel-bg)", borderColor: "var(--ed-panel-border)" }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--ed-panel-border)" }}
      >
        <span className="text-[11px] font-medium" style={{ color: "var(--ed-text)" }}>
          Document
        </span>
        {tag && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ backgroundColor: "var(--ed-badge-bg)", color: "var(--ed-badge-text)" }}
          >
            {tag}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </aside>
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

  return (
    <Section title="Layout">
      {/* Flex controls — only when display is flex */}
      {isFlex && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Direction</span>
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
          </div>

          {/* 3×3 Alignment Grid */}
          <div className="flex items-start gap-3 mb-2">
            <div>
              <span className="text-[10px] mb-0.5 block" style={{ color: "var(--ed-text-tertiary)" }}>Align</span>
              <AlignmentGrid
                alignItems={styles.alignItems}
                justifyContent={styles.justifyContent}
                onChange={(ai, jc) => {
                  updateStyle("align-items", ai);
                  updateStyle("justify-content", jc);
                }}
              />
            </div>
            <div className="flex-1">
              <ScrubInput label="Gap" value={parseNum(styles.gap)} onChange={(v) => updateStyle("gap", px(v))} min={0} />
            </div>
          </div>

          {/* Padding */}
          <div className="grid grid-cols-4 gap-1">
            <ScrubInput label="T" value={parseNum(styles.paddingTop)} onChange={(v) => updateStyle("padding-top", px(v))} min={0} />
            <ScrubInput label="R" value={parseNum(styles.paddingRight)} onChange={(v) => updateStyle("padding-right", px(v))} min={0} />
            <ScrubInput label="B" value={parseNum(styles.paddingBottom)} onChange={(v) => updateStyle("padding-bottom", px(v))} min={0} />
            <ScrubInput label="L" value={parseNum(styles.paddingLeft)} onChange={(v) => updateStyle("padding-left", px(v))} min={0} />
          </div>
        </>
      )}

      {/* Clip + Absolute checkboxes */}
      <div className="flex flex-col gap-1 mt-2">
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
    <Section title="Typography">
      <div className="space-y-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px]" style={{ color: "var(--ed-text-tertiary)" }}>Font</span>
          <input
            type="text"
            value={styles.fontFamily.replace(/"/g, "")}
            onChange={(e) => updateStyle("font-family", e.target.value)}
            className="w-full rounded px-1.5 py-0.5 text-[11px] focus:outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              border: "1px solid var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          />
        </div>
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
        <div className="grid grid-cols-2 gap-2">
          <ScrubInput label="Line height" value={parseNum(styles.lineHeight)} onChange={(v) => updateStyle("line-height", px(v))} min={0} />
          <ScrubInput label="Letter spacing" value={parseNum(styles.letterSpacing)} onChange={(v) => updateStyle("letter-spacing", px(v))} />
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
