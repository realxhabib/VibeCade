"use client";

/**
 * Small building blocks shared by the garage and the challenge setup: a
 * segmented picker with a sliding highlight, a collapsible section and the
 * race summary chips.
 */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import type { GpSettings } from "./logic";
import { trackById } from "./tracks";

export const GOLD = "#ffd166";

export function Segmented<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  /** Unique per picker on screen (names the sliding highlight). */
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled && !selected}
            onClick={() => {
              if (selected) return;
              play("tick");
              onChange(o.value);
            }}
            className="relative min-h-10 rounded-xl px-1.5 py-2 text-[13px] font-bold leading-tight transition-colors disabled:opacity-40"
          >
            {selected ? (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 rounded-xl shadow-[0_2px_0_rgba(0,0,0,0.35)]"
                style={{ background: GOLD }}
                transition={reduced ? { duration: 0 } : spring.layout}
              />
            ) : null}
            <span className={`relative ${selected ? "text-[#2a1400]" : "text-white/75"}`}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.svg
      viewBox="0 0 20 20"
      className="size-5 shrink-0 text-white/55"
      animate={{ rotate: open ? 180 : 0 }}
      transition={reduced ? { duration: 0 } : spring.snappy}
      aria-hidden
    >
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}

/** A tappable row that folds its content away until it's wanted. */
export function Disclosure({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="rounded-2xl bg-[rgba(10,6,30,0.86)] ring-1 ring-white/10 backdrop-blur-md">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          play("tick");
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className="text-lg leading-none" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-white">{title}</span>
          {hint ? <span className="block truncate text-[12px] text-white/55">{hint}</span> : null}
        </span>
        <Chevron open={open} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : spring.soft}
          >
            <div className="px-3.5 pb-3.5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** What this table is racing: the event, class, laps and rules, then the track(s). */
export function RaceInfo({ settings, align = "center" }: { settings: GpSettings; align?: "center" | "start" }) {
  const { cup, battle, knockout, mirror } = settings;
  const single = cup.tracks.length === 1;
  const chips = [
    battle ? "⚔️ Battle" : single ? "🏁 Single race" : `${cup.icon} ${cup.name}`,
    `${settings.cc}cc`,
    battle ? null : `${settings.laps} ${settings.laps === 1 ? "lap" : "laps"}`,
    knockout ? "💥 Knockout" : null,
    mirror ? "🪞 Mirror" : null,
  ].filter((c): c is string => !!c);
  return (
    <div className={`flex flex-col gap-2 ${align === "center" ? "items-center" : "items-start"}`}>
      <div className={`flex flex-wrap gap-1.5 ${align === "center" ? "justify-center" : ""}`}>
        {chips.map((c) => (
          <span key={c} className="rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-bold text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
            {c}
          </span>
        ))}
      </div>
      <div className={`flex flex-wrap gap-1.5 ${align === "center" ? "justify-center" : ""}`}>
        {cup.tracks.map((id, i) => {
          const t = trackById(id);
          return (
            <span
              key={`${id}${i}`}
              className="rounded-full px-3 py-1 text-[13px] font-black italic text-white"
              style={{ background: `linear-gradient(90deg, ${t.accent[0]}66, ${t.accent[1]}44)`, boxShadow: `inset 0 0 0 1px ${t.accent[0]}` }}
            >
              {single ? t.name : `${i + 1}. ${t.name}`}
            </span>
          );
        })}
      </div>
    </div>
  );
}
