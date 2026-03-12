"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";

type ColorPickerProps = {
  color: string;
  opacity?: number;
  onChange: (color: string, opacity: number) => void;
  onClose: () => void;
  recentColors?: string[];
  documentColors?: string[];
};

// ─── Main ColorPicker ───────────────────────────────────────

export function ColorPicker({
  color,
  opacity = 1,
  onChange,
  onClose,
  recentColors = [],
  documentColors = [],
}: ColorPickerProps) {
  const [hsva, setHsva] = useState(() => colorToHsva(color, opacity));
  const [hexInput, setHexInput] = useState(() => hsvaToHex(colorToHsva(color, opacity)));
  const [rgbInputs, setRgbInputs] = useState(() => {
    const rgb = hsvaToRgb(colorToHsva(color, opacity));
    return { r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) };
  });

  const emit = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const hex = hsvaToHex({ h, s, v, a });
      onChange(hex, a);
    },
    [onChange]
  );

  const updateFromHsva = useCallback(
    (next: HSVA) => {
      setHsva(next);
      setHexInput(hsvaToHex(next));
      const rgb = hsvaToRgb(next);
      setRgbInputs({ r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) });
      emit(next.h, next.s, next.v, next.a);
    },
    [emit]
  );

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="w-56 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Saturation/Brightness square */}
      <SatBrightSquare
        hue={hsva.h}
        saturation={hsva.s}
        brightness={hsva.v}
        onChange={(s, v) => updateFromHsva({ ...hsva, s, v })}
      />

      {/* Hue strip */}
      <div className="px-3 pt-2">
        <HueStrip hue={hsva.h} onChange={(h) => updateFromHsva({ ...hsva, h })} />
      </div>

      {/* Opacity strip */}
      <div className="px-3 pt-1.5">
        <OpacityStrip
          hsva={hsva}
          onChange={(a) => updateFromHsva({ ...hsva, a })}
        />
      </div>

      {/* Hex + RGB inputs */}
      <div className="px-3 pt-2">
        <div className="flex gap-1.5">
          {/* Hex */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-zinc-500">Hex</label>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => {
                const parsed = parseHex(hexInput);
                if (parsed) {
                  const next = colorToHsva(parsed, hsva.a);
                  updateFromHsva(next);
                } else {
                  setHexInput(hsvaToHex(hsva));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-[68px] rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 font-mono text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {/* R */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-zinc-500">R</label>
            <input
              type="text"
              value={rgbInputs.r}
              onChange={(e) =>
                setRgbInputs((p) => ({ ...p, r: e.target.value }))
              }
              onBlur={() => {
                const r = clamp(parseInt(rgbInputs.r) || 0, 0, 255);
                const rgb = hsvaToRgb(hsva);
                const next = rgbToHsva(r, rgb.g, rgb.b, hsva.a);
                updateFromHsva(next);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  (e.target as HTMLInputElement).blur();
              }}
              className="w-9 rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-center font-mono text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {/* G */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-zinc-500">G</label>
            <input
              type="text"
              value={rgbInputs.g}
              onChange={(e) =>
                setRgbInputs((p) => ({ ...p, g: e.target.value }))
              }
              onBlur={() => {
                const g = clamp(parseInt(rgbInputs.g) || 0, 0, 255);
                const rgb = hsvaToRgb(hsva);
                const next = rgbToHsva(rgb.r, g, rgb.b, hsva.a);
                updateFromHsva(next);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  (e.target as HTMLInputElement).blur();
              }}
              className="w-9 rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-center font-mono text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {/* B */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-zinc-500">B</label>
            <input
              type="text"
              value={rgbInputs.b}
              onChange={(e) =>
                setRgbInputs((p) => ({ ...p, b: e.target.value }))
              }
              onBlur={() => {
                const b = clamp(parseInt(rgbInputs.b) || 0, 0, 255);
                const rgb = hsvaToRgb(hsva);
                const next = rgbToHsva(rgb.r, rgb.g, b, hsva.a);
                updateFromHsva(next);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  (e.target as HTMLInputElement).blur();
              }}
              className="w-9 rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-center font-mono text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Opacity input */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <label className="text-[9px] text-zinc-500">Opacity</label>
          <input
            type="text"
            value={String(Math.round(hsva.a * 100))}
            onChange={() => {}}
            onBlur={(e) => {
              const val = clamp(parseInt(e.target.value) || 100, 0, 100);
              updateFromHsva({ ...hsva, a: val / 100 });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                (e.target as HTMLInputElement).blur();
            }}
            className="w-10 rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-center font-mono text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none"
          />
          <span className="text-[10px] text-zinc-500">%</span>
        </div>
      </div>

      {/* Eyedropper */}
      <div className="mt-2 border-t border-zinc-800 px-3 py-2">
        <button
          onClick={async () => {
            try {
              // EyeDropper API (Chromium only)
              if ("EyeDropper" in window) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dropper = new (window as any).EyeDropper();
                const result = await dropper.open();
                if (result?.sRGBHex) {
                  const next = colorToHsva(result.sRGBHex, hsva.a);
                  updateFromHsva(next);
                }
              }
            } catch {
              // User cancelled or API unavailable
            }
          }}
          className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <path d="M1 13l3-1 7-7-2-2-7 7-1 3z" />
            <path d="M10 1l3 3-1 1-3-3 1-1z" />
          </svg>
          Pick color
        </button>
      </div>

      {/* Recent colors */}
      {recentColors.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <div className="mb-1 text-[9px] font-medium uppercase text-zinc-500">
            Recent
          </div>
          <div className="flex flex-wrap gap-1">
            {recentColors.map((c, i) => (
              <button
                key={i}
                className="h-5 w-5 rounded border border-zinc-600 hover:border-zinc-400"
                style={{ background: c }}
                onClick={() => {
                  const next = colorToHsva(c, hsva.a);
                  updateFromHsva(next);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Document colors */}
      {documentColors.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <div className="mb-1 text-[9px] font-medium uppercase text-zinc-500">
            Document
          </div>
          <div className="flex flex-wrap gap-1">
            {documentColors.map((c, i) => (
              <button
                key={i}
                className="h-5 w-5 rounded border border-zinc-600 hover:border-zinc-400"
                style={{ background: c }}
                onClick={() => {
                  const next = colorToHsva(c, hsva.a);
                  updateFromHsva(next);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Saturation/Brightness Square ───────────────────────────

function SatBrightSquare({
  hue,
  saturation,
  brightness,
  onChange,
}: {
  hue: number;
  saturation: number;
  brightness: number;
  onChange: (s: number, v: number) => void;
}) {
  const squareRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      const rect = squareRef.current?.getBoundingClientRect();
      if (!rect) return;
      const s = clamp((clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
      onChange(s, v);
    },
    [onChange]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      handleMove(e.clientX, e.clientY);
    },
    [handleMove]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragging.current) return;
      handleMove(e.clientX, e.clientY);
    },
    [handleMove]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const hueColor = `hsl(${hue}, 100%, 50%)`;

  return (
    <div
      ref={squareRef}
      className="relative h-36 w-full cursor-crosshair overflow-hidden rounded-t-lg"
      style={{ background: hueColor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* White gradient left to right */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to right, #fff, transparent)",
        }}
      />
      {/* Black gradient bottom to top */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, #000, transparent)",
        }}
      />
      {/* Cursor */}
      <div
        className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{
          left: `${saturation * 100}%`,
          top: `${(1 - brightness) * 100}%`,
        }}
      />
    </div>
  );
}

// ─── Hue Strip ──────────────────────────────────────────────

function HueStrip({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (h: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback(
    (clientX: number) => {
      const rect = stripRef.current?.getBoundingClientRect();
      if (!rect) return;
      const h = clamp(((clientX - rect.left) / rect.width) * 360, 0, 360);
      onChange(h);
    },
    [onChange]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      handleMove(e.clientX);
    },
    [handleMove]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragging.current) return;
      handleMove(e.clientX);
    },
    [handleMove]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={stripRef}
      className="relative h-3 w-full cursor-pointer rounded-full"
      style={{
        background:
          "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{
          left: `${(hue / 360) * 100}%`,
          background: `hsl(${hue}, 100%, 50%)`,
        }}
      />
    </div>
  );
}

// ─── Opacity Strip ──────────────────────────────────────────

function OpacityStrip({
  hsva,
  onChange,
}: {
  hsva: HSVA;
  onChange: (a: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback(
    (clientX: number) => {
      const rect = stripRef.current?.getBoundingClientRect();
      if (!rect) return;
      const a = clamp((clientX - rect.left) / rect.width, 0, 1);
      onChange(a);
    },
    [onChange]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      handleMove(e.clientX);
    },
    [handleMove]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragging.current) return;
      handleMove(e.clientX);
    },
    [handleMove]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const solidColor = hsvaToHex({ ...hsva, a: 1 });

  return (
    <div
      ref={stripRef}
      className="relative h-3 w-full cursor-pointer overflow-hidden rounded-full"
      style={{
        // Checkerboard background for transparency preview
        backgroundImage: `
          linear-gradient(45deg, #444 25%, transparent 25%),
          linear-gradient(-45deg, #444 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #444 75%),
          linear-gradient(-45deg, transparent 75%, #444 75%)
        `,
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Gradient overlay */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `linear-gradient(to right, transparent, ${solidColor})`,
        }}
      />
      {/* Thumb */}
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{
          left: `${hsva.a * 100}%`,
          background: solidColor,
          opacity: hsva.a,
        }}
      />
    </div>
  );
}

// ─── Color Math ─────────────────────────────────────────────

type HSVA = { h: number; s: number; v: number; a: number };

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function colorToHsva(color: string, alpha = 1): HSVA {
  let r = 0,
    g = 0,
    b = 0,
    a = alpha;

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) {
        a = parseInt(hex.slice(6, 8), 16) / 255;
      }
    }
  } else {
    const match = color.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
    );
    if (match) {
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
      if (match[4] !== undefined) a = parseFloat(match[4]);
    }
  }

  return rgbToHsva(r, g, b, a);
}

function rgbToHsva(r: number, g: number, b: number, a: number): HSVA {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s, v, a };
}

function hsvaToRgb(hsva: HSVA): { r: number; g: number; b: number } {
  const { h, s, v } = hsva;
  const i = Math.floor((h / 60) % 6);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = 0,
    g = 0,
    b = 0;
  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function hsvaToHex(hsva: HSVA): string {
  const { r, g, b } = hsvaToRgb(hsva);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function parseHex(input: string): string | null {
  let hex = input.trim();
  if (!hex.startsWith("#")) hex = "#" + hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex) || /^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex;
  }
  return null;
}
