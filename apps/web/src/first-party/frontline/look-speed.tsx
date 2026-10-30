"use client";

/**
 * The look speed slider (Slower ↔ Faster). Phones get it on the loadout
 * screen as well as in the pause menu, so it's easy to find before the fight.
 */

import { cn } from "@/lib/utils";
import { MAX_SENSITIVITY, MIN_SENSITIVITY, type Settings } from "./settings";

export function LookSpeed({ settings, onSettings, touch, className }: { settings: Settings; onSettings: (s: Settings) => void; touch: boolean; className?: string }) {
  const key = touch ? "touchSensitivity" : "sensitivity";
  const value = settings[key];
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="flex justify-between text-xs font-semibold text-ink-300">
        <span>{touch ? "Look speed" : "Mouse sensitivity"}</span>
        <span className="font-mono tabular">{value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={MIN_SENSITIVITY}
        max={MAX_SENSITIVITY}
        step={0.1}
        value={value}
        onChange={(e) => onSettings({ ...settings, [key]: Number(e.target.value) })}
        className="accent-[var(--accent-from)]"
        aria-label={touch ? "Look speed" : "Sensitivity"}
      />
      <span className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-ink-400">
        <span>Slower</span>
        <span>Faster</span>
      </span>
    </label>
  );
}
