"use client";

/**
 * Match options on the loadout screen: the host (the lowest-seated person)
 * can change the time limit, the kill limit and the season right up to the
 * start, in any match (quick matches included); everyone else sees what was
 * picked. Changes go into the shared match state as `{ pre: settings }`
 * (see `optionsFrom`), which the match document replaces when the fight
 * starts.
 */

import { useMatchState } from "vibecade-sdk/react";
import type { Json } from "vibecade-sdk";
import { play } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { killChoices, SEASONS, SEASON_ICON, SEASON_LABEL, TIME_CHOICES, minutesOf, toSettings, type MatchOptions, type SeasonChoice } from "./options";
import { parseDoc } from "./rules";

export function HostOptions({ options, host, standardKills, compact }: { options: MatchOptions; host: boolean; standardKills: number; compact?: boolean }) {
  const { update } = useMatchState();

  const change = (patch: Partial<MatchOptions>) => {
    if (!host) return;
    play("tick");
    const next = { ...options, ...patch };
    // Never touch a match document that already exists (the fight has started).
    update((raw) => (parseDoc(raw) ? undefined : ({ pre: toSettings(next) } as unknown as Json))).catch((error: unknown) => console.warn("[frontline] options update failed", error));
  };

  const minutes = minutesOf(options);
  return (
    <div className={cn("glass flex w-full max-w-md flex-col rounded-2xl px-3", compact ? "gap-1.5 py-2" : "gap-2 py-2.5")}>
      <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">
        <span>Match options</span>
        <span className="normal-case tracking-normal text-ink-400">{host ? "You're the host" : "The host picks"}</span>
      </p>
      <Row label="Time">
        {TIME_CHOICES.map((m) => (
          <Chip key={m} on={m === minutes} disabled={!host} onClick={() => change({ minutes: m })}>
            {m}m
          </Chip>
        ))}
      </Row>
      <Row label="Kills">
        {killChoices(standardKills).map((k) => (
          <Chip key={String(k)} on={k === options.kills} disabled={!host} onClick={() => change({ kills: k })}>
            {k === null ? standardKills : k === 0 ? "∞" : k}
          </Chip>
        ))}
      </Row>
      <Row label="Season">
        {(["auto", ...SEASONS] as SeasonChoice[]).map((s) => (
          <Chip key={s} on={s === options.season} disabled={!host} onClick={() => change({ season: s })} title={s === "auto" ? "This time of year" : SEASON_LABEL[s]}>
            {s === "auto" ? "Now" : SEASON_ICON[s]}
          </Chip>
        ))}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs font-semibold text-ink-400">{label}</span>
      <div className="grid flex-1 grid-flow-col gap-1">{children}</div>
    </div>
  );
}

function Chip({ on, disabled, onClick, title, children }: { on: boolean; disabled: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      disabled={disabled && !on}
      onClick={on ? undefined : onClick}
      className={cn(
        "h-7 rounded-lg px-1 text-xs font-bold transition-colors",
        on ? "bg-[linear-gradient(120deg,var(--accent-from),var(--accent-to))] text-ink-950" : "bg-white/[0.06] text-ink-200 hover:bg-white/[0.12]",
        disabled && !on && "opacity-35 hover:bg-white/[0.06]",
        disabled && on && "cursor-default",
      )}
    >
      {children}
    </button>
  );
}
