"use client";

/**
 * Challenge setup (purpose "setup"): the host picks the match length, the
 * kill limit and the season. Light on purpose: no three.js here (the embed
 * page loads this instead of the game when the host opens it to set up).
 */

import { useSetup, useVibeCade } from "vibecade-sdk/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { FFA_LIMIT } from "./rules";
import {
  killChoices,
  SEASON_ICON,
  SEASON_LABEL,
  SEASONS,
  SEASON_TWIST,
  TIME_CHOICES,
  minutesOf,
  optionsSummary,
  parseOptions,
  seasonOf,
  toSettings,
  type MatchOptions,
  type SeasonChoice,
} from "./options";

export function FrontlineSetup() {
  const xapps = useVibeCade();
  const { submit, cancel, settings: initial } = useSetup();
  const [opts, setOpts] = useState<MatchOptions>(() => parseOptions(initial));
  const [busy, setBusy] = useState(false);
  const readied = useRef(false);
  const [now] = useState(() => seasonOf(new Date()));

  // Lift the host's loading cover: the form is ready.
  useEffect(() => {
    if (readied.current) return;
    readied.current = true;
    xapps.ready().catch(() => {});
  }, [xapps]);

  const set = (patch: Partial<MatchOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const minutes = minutesOf(opts);

  const send = () => {
    setBusy(true);
    play("go");
    submit(toSettings(opts), optionsSummary(opts)).catch(() => setBusy(false));
  };

  return (
    <div className="flex h-full flex-col text-ink-50">
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-5">
        <h1 className="font-display text-[26px] font-extrabold uppercase italic leading-none tracking-tight">
          Set up the <span className="bg-[linear-gradient(100deg,var(--accent-from),var(--accent-to))] bg-clip-text pr-1 text-transparent">fight</span>
        </h1>

        <Section title="Time limit">
          <Segmented
            id="time"
            label="Time limit"
            value={minutes}
            onChange={(m) => set({ minutes: m })}
            options={TIME_CHOICES.map((m) => ({ value: m, label: `${m} min` }))}
          />
        </Section>

        <Section title="Kill limit" hint={opts.kills === 0 ? "No kill limit: the most kills when the clock runs out wins." : "First to reach it wins. In team play it's the team's total."}>
          <Segmented
            id="kills"
            label="Kill limit"
            value={opts.kills === null ? "std" : String(opts.kills)}
            onChange={(v) => set({ kills: v === "std" ? null : Number(v) })}
            options={killChoices(FFA_LIMIT).map((k) => ({
              value: k === null ? "std" : String(k),
              label: k === null ? `${FFA_LIMIT}*` : k === 0 ? "None" : String(k),
            }))}
          />
          {opts.kills === null && <p className="px-1 text-[12px] leading-snug text-ink-400">* Standard: {FFA_LIMIT} each, or 30 to 40 for a team.</p>}
        </Section>

        <Section title="Season" hint={SEASON_TWIST[opts.season === "auto" ? now : opts.season]}>
          <Segmented<SeasonChoice>
            id="season"
            label="Season"
            value={opts.season}
            onChange={(season) => set({ season })}
            options={[
              { value: "auto", label: <span className="flex flex-col items-center leading-tight">Now<span className="text-[15px]">{SEASON_ICON[now]}</span></span> },
              ...SEASONS.map((s) => ({ value: s, label: <span className="flex flex-col items-center leading-tight" title={SEASON_LABEL[s]}><span className="hidden min-[380px]:inline">{SEASON_LABEL[s]}</span><span className="text-[15px]">{SEASON_ICON[s]}</span></span> })),
            ]}
          />
        </Section>
      </div>

      <div className="flex gap-2 border-t border-white/10 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <button type="button" className="rounded-full px-4 py-3 text-[14px] font-bold text-ink-200 ring-1 ring-white/20" onClick={() => cancel().catch(() => {})}>
          Cancel
        </button>
        <motion.button
          type="button"
          disabled={busy}
          whileTap={{ scale: 0.97 }}
          className="flex min-w-0 flex-1 flex-col items-center rounded-full bg-[linear-gradient(120deg,var(--accent-from),var(--accent-to))] px-3 py-2 text-ink-950 disabled:opacity-70"
          onClick={send}
        >
          <span className="text-[16px] font-extrabold leading-tight">Send challenge</span>
          <span className="w-full truncate text-[11.5px] font-bold leading-tight opacity-75">{optionsSummary(opts)}</span>
        </motion.button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-5 flex flex-col gap-2">
      <h2 className="px-1 text-[12px] font-bold uppercase tracking-wider text-ink-300">{title}</h2>
      {children}
      {hint && <p className="px-1 text-[12.5px] leading-snug text-ink-400">{hint}</p>}
    </section>
  );
}

function Segmented<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (selected) return;
              play("tick");
              onChange(o.value);
            }}
            className="relative min-h-10 rounded-xl px-1 py-2 text-[13px] font-bold leading-tight"
          >
            {selected && (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 rounded-xl bg-[linear-gradient(120deg,var(--accent-from),var(--accent-to))]"
                transition={reduced ? { duration: 0 } : spring.layout}
              />
            )}
            <span className={cn("relative", selected ? "text-ink-950" : "text-ink-200")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
