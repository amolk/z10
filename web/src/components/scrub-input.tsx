"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type ScrubInputProps = {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Fine step when Alt is held (default 0.1) */
  fineStep?: number;
  /** Coarse step when Shift is held (default 10) */
  coarseStep?: number;
  /** If true, the label is rendered inline left of the input */
  inline?: boolean;
  /** Width class override */
  className?: string;
  disabled?: boolean;
};

/**
 * Numeric input with drag-to-scrub on label and arrow key support.
 *
 * Interactions:
 * - Drag on label: ↔ scrub ±step per pixel (Shift: ±coarseStep, Alt: ±fineStep)
 * - Arrow keys when focused: Up/Down ±step (Shift: ±coarseStep)
 * - Enter or blur: commits
 * - Escape: reverts to original value
 */
export function ScrubInput({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
  fineStep = 0.1,
  coarseStep = 10,
  inline = false,
  className = "",
  disabled = false,
}: ScrubInputProps) {
  const [local, setLocal] = useState(value);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const originalValue = useRef(value);
  const scrubStartX = useRef(0);
  const scrubStartValue = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocal(value);
    originalValue.current = value;
  }, [value]);

  const clampValue = useCallback(
    (n: number): number => {
      let v = n;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    },
    [min, max]
  );

  const commit = useCallback(
    (v: string) => {
      const trimmed = v.trim();
      if (trimmed !== value) {
        onChange(trimmed);
      }
    },
    [onChange, value]
  );

  // ─── Drag-to-scrub on label ────────────────────────────────
  const handleLabelMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      const numVal = parseFloat(local) || 0;
      scrubStartX.current = e.clientX;
      scrubStartValue.current = numVal;
      setIsScrubbing(true);

      const handleMouseMove = (me: MouseEvent) => {
        const dx = me.clientX - scrubStartX.current;
        let activeStep = step;
        if (me.shiftKey) activeStep = coarseStep;
        else if (me.altKey) activeStep = fineStep;
        const newVal = clampValue(scrubStartValue.current + dx * activeStep);
        const rounded =
          activeStep < 1
            ? parseFloat(newVal.toFixed(1))
            : Math.round(newVal);
        setLocal(String(rounded));
        onChange(String(rounded));
      };

      const handleMouseUp = () => {
        setIsScrubbing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [disabled, local, step, coarseStep, fineStep, clampValue, onChange]
  );

  // ─── Arrow key support ─────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commit(local);
        inputRef.current?.blur();
        return;
      }
      if (e.key === "Escape") {
        setLocal(originalValue.current);
        inputRef.current?.blur();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const numVal = parseFloat(local) || 0;
        const activeStep = e.shiftKey ? coarseStep : step;
        const delta = e.key === "ArrowUp" ? activeStep : -activeStep;
        const newVal = clampValue(numVal + delta);
        const rounded =
          activeStep < 1
            ? parseFloat(newVal.toFixed(1))
            : Math.round(newVal);
        setLocal(String(rounded));
        onChange(String(rounded));
      }
    },
    [local, commit, step, coarseStep, clampValue, onChange]
  );

  const labelEl = label ? (
    <span
      className="select-none text-[11px]"
      style={{
        color: "var(--ed-text-tertiary)",
        cursor: disabled ? "default" : "ew-resize",
      }}
      onMouseDown={handleLabelMouseDown}
    >
      {label}
    </span>
  ) : null;

  if (inline) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {labelEl}
        <input
          ref={inputRef}
          type="text"
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => commit(local)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            originalValue.current = local;
          }}
          className="w-full rounded px-1.5 py-0.5 text-[11px] tabular-nums focus:outline-none"
          style={{
            backgroundColor: "var(--ed-input-bg)",
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: isScrubbing
              ? "var(--ed-input-border-focus)"
              : "var(--ed-input-border)",
            color: "var(--ed-text)",
          }}
        />
        {suffix && (
          <span
            className="text-[11px]"
            style={{ color: "var(--ed-text-tertiary)" }}
          >
            {suffix}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {labelEl}
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => commit(local)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            originalValue.current = local;
          }}
          className="w-full rounded px-1.5 py-1 text-[11px] tabular-nums focus:outline-none"
          style={{
            backgroundColor: "var(--ed-input-bg)",
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "var(--ed-input-border)",
            color: "var(--ed-text)",
          }}
          onFocusCapture={(e) => {
            e.currentTarget.style.borderColor =
              "var(--ed-input-border-focus)";
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderColor = "var(--ed-input-border)";
          }}
        />
        {suffix && (
          <span
            className="ml-1 text-[11px]"
            style={{ color: "var(--ed-text-tertiary)" }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
