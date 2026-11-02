"use client";

/**
 * A small number box for a custom match option (minutes or kills). It keeps
 * a draft while you type and commits a clamped whole number on Enter or when
 * it loses focus; Escape gives up.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

export function CustomNumber({
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
  onCancel,
  className,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  suffix?: string;
  onCommit: (value: number) => void;
  onCancel?: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  const commit = () => {
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || !Number.isFinite(n)) return onCancel?.();
    onCommit(Math.min(max, Math.max(min, n)));
  };

  return (
    <label className={cn("flex items-center gap-1", className)}>
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        autoFocus
        value={draft}
        placeholder={`${min}–${max}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            setDraft(value === null ? "" : String(value));
            onCancel?.();
          }
        }}
        className="h-full w-full min-w-0 rounded-lg bg-white/[0.1] px-1.5 text-center font-bold text-ink-50 outline-none ring-1 ring-white/25 focus:ring-[var(--accent-from)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix && <span className="shrink-0 text-ink-300">{suffix}</span>}
    </label>
  );
}
