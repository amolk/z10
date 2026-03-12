"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor, getElementStyles, type ElementStyles } from "@/lib/editor-state";
import { ColorPicker } from "@/components/color-picker";
import {
  Plus,
  Link2,
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
} from "lucide-react";

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
    const el = transformRef.current?.querySelector(
      `[data-z10-id="${id}"]`
    ) as HTMLElement | null;
    if (!el) {
      setStyles(null);
      return;
    }

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
      <aside
        className="flex w-[260px] flex-col border-l"
        style={{ backgroundColor: "var(--ed-panel-bg)", borderColor: "var(--ed-panel-border)" }}
      >
        <PanelHeader tag="" />
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>
            Select an element to view properties
          </p>
        </div>
      </aside>
    );
  }

  if (selectedIds.size > 1) {
    return (
      <aside
        className="flex w-[260px] flex-col border-l"
        style={{ backgroundColor: "var(--ed-panel-bg)", borderColor: "var(--ed-panel-border)" }}
      >
        <PanelHeader tag="" />
        <div className="p-3">
          <AlignmentSection />
          <div className="mt-3 text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>
            {selectedIds.size} elements selected
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-[260px] flex-col border-l"
      style={{ backgroundColor: "var(--ed-panel-bg)", borderColor: "var(--ed-panel-border)" }}
    >
      <PanelHeader tag={elementTag} />

      <div className="flex-1 overflow-y-auto">
        <AlignmentSection />
        {styles && <LayoutSection styles={styles} updateStyle={updateStyle} />}
        {styles && <FrameSection styles={styles} updateStyle={updateStyle} />}
        {styles && <FillSection styles={styles} updateStyle={updateStyle} />}
        {styles && <StrokeSection styles={styles} updateStyle={updateStyle} />}
        {styles && <TypographySection styles={styles} updateStyle={updateStyle} />}
        {styles && <EffectsSection styles={styles} />}
      </div>
    </aside>
  );
}

// ─── Panel Header ───────────────────────────────────────────

function PanelHeader({ tag }: { tag: string }) {
  return (
    <div
      className="flex items-center justify-between border-b px-3 py-2"
      style={{ borderColor: "var(--ed-panel-border)" }}
    >
      <span className="text-[12px] font-medium" style={{ color: "var(--ed-text)" }}>
        Document
      </span>
      {tag && (
        <span
          className="rounded px-1.5 py-0.5 text-[12px]"
          style={{ backgroundColor: "var(--ed-badge-bg)", color: "var(--ed-badge-text)" }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}

// ─── Section Components ─────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0 py-1.5">
      <span className="text-[12px] font-medium" style={{ color: "var(--ed-text)" }}>
        {title}
      </span>
      {action}
    </div>
  );
}

function PropInput({
  label,
  value,
  onChange,
  suffix,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  type?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>
          {label}
        </label>
      )}
      <div className="flex items-center">
        <input
          type={type}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onChange(local)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onChange(local);
          }}
          className="w-full rounded border px-1.5 py-1 text-[12px] focus:outline-none"
          style={{
            backgroundColor: "var(--ed-input-bg)",
            borderColor: "var(--ed-input-border)",
            color: "var(--ed-text)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--ed-input-border-focus)"; }}
          onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--ed-input-border)"; }}
        />
        {suffix && (
          <span className="ml-1 text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ColorSwatch({
  color,
  onChange,
}: {
  color: string;
  onChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className="h-6 w-6 rounded border cursor-pointer"
        style={{ background: color, borderColor: "var(--ed-input-border)" }}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="absolute left-0 top-8 z-50">
          <ColorPicker
            color={color}
            onChange={(c) => onChange(c)}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Alignment ──────────────────────────────────────────────

function AlignmentSection() {
  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <SectionHeader title="Alignment" />
      <div className="mt-1 flex gap-0.5">
        {[
          { title: "Align left", icon: "align-left" },
          { title: "Align center H", icon: "align-center-h" },
          { title: "Align right", icon: "align-right" },
          { title: "Align top", icon: "align-top" },
          { title: "Align center V", icon: "align-center-v" },
          { title: "Align bottom", icon: "align-bottom" },
        ].map((btn) => (
          <button
            key={btn.icon}
            title={btn.title}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors"
            style={{ color: "var(--ed-icon-color)" }}
          >
            <AlignIcon type={btn.icon} />
          </button>
        ))}
        <div className="mx-0.5 w-px" style={{ backgroundColor: "var(--ed-section-border)" }} />
        {[
          { title: "Distribute horizontally", icon: "dist-h" },
          { title: "Distribute vertically", icon: "dist-v" },
        ].map((btn) => (
          <button
            key={btn.icon}
            title={btn.title}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors"
            style={{ color: "var(--ed-icon-color)" }}
          >
            <AlignIcon type={btn.icon} />
          </button>
        ))}
      </div>
    </div>
  );
}

function AlignIcon({ type }: { type: string }) {
  const props = { size: 14, strokeWidth: 1.5 };
  switch (type) {
    case "align-left":
      return <AlignHorizontalJustifyStart {...props} />;
    case "align-center-h":
      return <AlignHorizontalJustifyCenter {...props} />;
    case "align-right":
      return <AlignHorizontalJustifyEnd {...props} />;
    case "align-top":
      return <AlignVerticalJustifyStart {...props} />;
    case "align-center-v":
      return <AlignVerticalJustifyCenter {...props} />;
    case "align-bottom":
      return <AlignVerticalJustifyEnd {...props} />;
    case "dist-h":
      return <AlignHorizontalSpaceAround {...props} />;
    case "dist-v":
      return <AlignVerticalSpaceAround {...props} />;
    default:
      return null;
  }
}

// ─── Layout (Auto Layout) ───────────────────────────────────

function LayoutSection({
  styles,
  updateStyle,
}: {
  styles: ElementStyles;
  updateStyle: (prop: string, value: string) => void;
}) {
  const isFlex = styles.display === "flex" || styles.display === "inline-flex";
  if (!isFlex) return null;

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <SectionHeader title="Layout" />
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>Direction</label>
          <select
            value={styles.flexDirection}
            onChange={(e) => updateStyle("flex-direction", e.target.value)}
            className="rounded border px-1.5 py-1 text-[12px] focus:outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              borderColor: "var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          >
            <option value="row">Horizontal</option>
            <option value="column">Vertical</option>
            <option value="row-reverse">Row Reverse</option>
            <option value="column-reverse">Col Reverse</option>
          </select>
        </div>
        <PropInput
          label="Gap"
          value={parseNumeric(styles.gap)}
          onChange={(v) => updateStyle("gap", ensurePx(v))}
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        <PropInput label="T" value={parseNumeric(styles.paddingTop)} onChange={(v) => updateStyle("padding-top", ensurePx(v))} />
        <PropInput label="R" value={parseNumeric(styles.paddingRight)} onChange={(v) => updateStyle("padding-right", ensurePx(v))} />
        <PropInput label="B" value={parseNumeric(styles.paddingBottom)} onChange={(v) => updateStyle("padding-bottom", ensurePx(v))} />
        <PropInput label="L" value={parseNumeric(styles.paddingLeft)} onChange={(v) => updateStyle("padding-left", ensurePx(v))} />
      </div>
    </div>
  );
}

// ─── Frame ──────────────────────────────────────────────────

function FrameSection({
  styles,
  updateStyle,
}: {
  styles: ElementStyles;
  updateStyle: (prop: string, value: string) => void;
}) {
  const [constrainProportions, setConstrainProportions] = useState(false);

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <SectionHeader title="Frame" />
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="flex items-end gap-1">
          <div className="flex-1">
            <PropInput label="W" value={parseNumeric(styles.width)} onChange={(v) => updateStyle("width", ensurePx(v))} />
          </div>
          <button
            onClick={() => setConstrainProportions(!constrainProportions)}
            className="mb-1 flex h-6 w-5 items-center justify-center rounded text-[12px]"
            style={{ color: constrainProportions ? "#3b82f6" : "var(--ed-text-tertiary)" }}
            title="Constrain proportions"
          >
            <Link2 size={12} strokeWidth={1.5} />
          </button>
          <div className="flex-1">
            <PropInput label="H" value={parseNumeric(styles.height)} onChange={(v) => updateStyle("height", ensurePx(v))} />
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <PropInput label="X" value={parseNumeric(styles.x)} onChange={(v) => updateStyle("left", ensurePx(v))} />
        <PropInput label="Y" value={parseNumeric(styles.y)} onChange={(v) => updateStyle("top", ensurePx(v))} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <PropInput label="Rotation" value={parseNumeric(styles.rotation)} onChange={(v) => updateStyle("rotate", v + "deg")} suffix="°" />
        <PropInput label="Radius" value={parseNumeric(styles.borderRadius)} onChange={(v) => updateStyle("border-radius", ensurePx(v))} />
      </div>
    </div>
  );
}

// ─── Fill ───────────────────────────────────────────────────

function FillSection({
  styles,
  updateStyle,
}: {
  styles: ElementStyles;
  updateStyle: (prop: string, value: string) => void;
}) {
  const fill = styles.fills[0];

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <SectionHeader
        title="Fill"
        action={
          <button
            onClick={() => { if (!fill) updateStyle("background-color", "#cccccc"); }}
            style={{ color: "var(--ed-icon-color)" }}
            title="Add fill"
          >
            <Plus size={12} strokeWidth={1.5} />
          </button>
        }
      />
      {fill ? (
        <div className="mt-1 flex items-center gap-2">
          <ColorSwatch color={fill.color} onChange={(c) => updateStyle("background-color", c)} />
          <input
            type="text"
            value={rgbToHex(fill.color)}
            onChange={(e) => updateStyle("background-color", e.target.value)}
            className="flex-1 rounded border px-1.5 py-1 font-mono text-[12px] focus:outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              borderColor: "var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          />
          <PropInput
            label=""
            value={String(Math.round(parseFloat(styles.opacity) * 100))}
            onChange={(v) => updateStyle("opacity", String(parseInt(v) / 100))}
            suffix="%"
          />
        </div>
      ) : (
        <div className="mt-1 text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>No fill</div>
      )}
    </div>
  );
}

// ─── Stroke ─────────────────────────────────────────────────

function StrokeSection({
  styles,
  updateStyle,
}: {
  styles: ElementStyles;
  updateStyle: (prop: string, value: string) => void;
}) {
  const hasStroke = styles.stroke.style !== "none" && styles.stroke.width !== "0px";

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <SectionHeader
        title="Outline"
        action={
          <button
            onClick={() => { if (!hasStroke) updateStyle("border", "1px solid #000000"); }}
            style={{ color: "var(--ed-icon-color)" }}
            title="Add stroke"
          >
            <Plus size={12} strokeWidth={1.5} />
          </button>
        }
      />
      {hasStroke ? (
        <div className="mt-1 space-y-2">
          <div className="flex items-center gap-2">
            <ColorSwatch color={styles.stroke.color} onChange={(c) => updateStyle("border-color", c)} />
            <input
              type="text"
              value={rgbToHex(styles.stroke.color)}
              onChange={(e) => updateStyle("border-color", e.target.value)}
              className="flex-1 rounded border px-1.5 py-1 font-mono text-[12px] focus:outline-none"
              style={{
                backgroundColor: "var(--ed-input-bg)",
                borderColor: "var(--ed-input-border)",
                color: "var(--ed-text)",
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PropInput label="Width" value={parseNumeric(styles.stroke.width)} onChange={(v) => updateStyle("border-width", ensurePx(v))} />
            <div className="flex flex-col gap-0.5">
              <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>Style</label>
              <select
                value={styles.stroke.style}
                onChange={(e) => updateStyle("border-style", e.target.value)}
                className="rounded border px-1.5 py-1 text-[12px] focus:outline-none"
                style={{
                  backgroundColor: "var(--ed-input-bg)",
                  borderColor: "var(--ed-input-border)",
                  color: "var(--ed-text)",
                }}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>Position</label>
              <select
                value="inside"
                onChange={() => {}}
                className="rounded border px-1.5 py-1 text-[12px] focus:outline-none"
                style={{
                  backgroundColor: "var(--ed-input-bg)",
                  borderColor: "var(--ed-input-border)",
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
        <div className="mt-1 text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>No outline</div>
      )}
    </div>
  );
}

// ─── Typography ─────────────────────────────────────────────

function TypographySection({
  styles,
  updateStyle,
}: {
  styles: ElementStyles;
  updateStyle: (prop: string, value: string) => void;
}) {
  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <SectionHeader title="Typography" />
      <div className="mt-1 space-y-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>Font</label>
          <input
            type="text"
            value={styles.fontFamily.replace(/"/g, "")}
            onChange={(e) => updateStyle("font-family", e.target.value)}
            className="w-full rounded border px-1.5 py-1 text-[12px] focus:outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              borderColor: "var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>Weight</label>
            <select
              value={styles.fontWeight}
              onChange={(e) => updateStyle("font-weight", e.target.value)}
              className="rounded border px-1.5 py-1 text-[12px] focus:outline-none"
              style={{
                backgroundColor: "var(--ed-input-bg)",
                borderColor: "var(--ed-input-border)",
                color: "var(--ed-text)",
              }}
            >
              <option value="100">Thin</option>
              <option value="200">Extra Light</option>
              <option value="300">Light</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semi Bold</option>
              <option value="700">Bold</option>
              <option value="800">Extra Bold</option>
              <option value="900">Black</option>
            </select>
          </div>
          <PropInput label="Size" value={parseNumeric(styles.fontSize)} onChange={(v) => updateStyle("font-size", ensurePx(v))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PropInput label="Line height" value={parseNumeric(styles.lineHeight)} onChange={(v) => updateStyle("line-height", ensurePx(v))} />
          <PropInput label="Letter spacing" value={parseNumeric(styles.letterSpacing)} onChange={(v) => updateStyle("letter-spacing", ensurePx(v))} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>Align</label>
          <div className="flex gap-0.5">
            {(["left", "center", "right", "justify"] as const).map((align) => (
              <button
                key={align}
                onClick={() => updateStyle("text-align", align)}
                className="flex h-6 w-7 items-center justify-center rounded text-[12px] transition-colors"
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
          <label className="text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>Color</label>
          <ColorSwatch color={styles.color} onChange={(c) => updateStyle("color", c)} />
          <input
            type="text"
            value={rgbToHex(styles.color)}
            onChange={(e) => updateStyle("color", e.target.value)}
            className="flex-1 rounded border px-1.5 py-1 font-mono text-[12px] focus:outline-none"
            style={{
              backgroundColor: "var(--ed-input-bg)",
              borderColor: "var(--ed-input-border)",
              color: "var(--ed-text)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TextAlignIcon({ align }: { align: string }) {
  const props = { size: 12, strokeWidth: 1.5 };
  switch (align) {
    case "left":
      return <AlignLeft {...props} />;
    case "center":
      return <AlignCenter {...props} />;
    case "right":
      return <AlignRight {...props} />;
    case "justify":
      return <AlignJustify {...props} />;
    default:
      return null;
  }
}

// ─── Effects ────────────────────────────────────────────────

function EffectsSection({ styles }: { styles: ElementStyles }) {
  return (
    <div className="border-b px-3 py-2" style={{ borderColor: "var(--ed-section-border)" }}>
      <SectionHeader
        title="Shadow"
        action={
          <button style={{ color: "var(--ed-icon-color)" }} title="Add effect">
            <Plus size={12} strokeWidth={1.5} />
          </button>
        }
      />
      {styles.effects.length > 0 ? (
        <div className="mt-1 space-y-1">
          {styles.effects.map((effect, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ed-text-secondary)" }}>
              <span className="capitalize">{effect.type}</span>
              {effect.blur && <span>blur: {effect.blur}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-1 text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>No shadow</div>
      )}
    </div>
  );
}

// ─── Utils ──────────────────────────────────────────────────

function parseNumeric(value: string): string {
  if (!value || value === "auto" || value === "normal" || value === "none") return value;
  const match = value.match(/^(-?[\d.]+)/);
  return match ? match[1] : value;
}

function ensurePx(value: string): string {
  if (!value) return "0px";
  if (/^\d+(\.\d+)?$/.test(value)) return value + "px";
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
