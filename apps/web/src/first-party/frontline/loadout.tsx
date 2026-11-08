"use client";

/**
 * The loadout picker: four primaries (with a side-view silhouette and stat
 * bars), the sidearm everyone carries, and one perk. Used full-size before
 * the match and compact on the death screen (applies from the next spawn).
 */

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { GUN_GAME_LADDER, PERKS, PERK_IDS, PRIMARIES, WEAPONS, type Loadout, type PerkId, type WeaponId } from "./weapons";

/** Side views drawn from rectangles, 120 × 40. */
export function GunGlyph({ id, className }: { id: WeaponId; className?: string }) {
  const body = "currentColor";
  const shapes: Record<WeaponId, React.ReactNode> = {
    ar: (
      <>
        <rect x="30" y="14" width="46" height="9" rx="1.5" fill={body} />
        <rect x="76" y="15.5" width="26" height="6" rx="1" fill={body} opacity="0.85" />
        <rect x="102" y="17" width="14" height="2.6" fill={body} />
        <rect x="6" y="15" width="26" height="7" rx="2" fill={body} opacity="0.85" />
        <path d="M52 23 L62 23 L64 36 L56 37 Z" fill={body} opacity="0.9" />
        <path d="M36 23 L43 23 L41 33 L35 33 Z" fill={body} />
        <rect x="40" y="11" width="30" height="2.6" fill={body} />
      </>
    ),
    smg: (
      <>
        <rect x="34" y="14" width="40" height="10" rx="1.5" fill={body} />
        <rect x="74" y="16.5" width="14" height="5" fill={body} />
        <rect x="14" y="16" width="22" height="4" fill={body} opacity="0.8" />
        <rect x="56" y="24" width="7" height="14" rx="1" fill={body} opacity="0.9" />
        <path d="M40 24 L47 24 L45 34 L39 34 Z" fill={body} />
      </>
    ),
    sniper: (
      <>
        <rect x="26" y="16" width="46" height="8" rx="1.5" fill={body} />
        <rect x="72" y="18" width="44" height="3.2" fill={body} />
        <path d="M4 16 L28 17 L28 24 L6 27 Z" fill={body} opacity="0.85" />
        <rect x="36" y="7" width="30" height="6" rx="3" fill={body} />
        <rect x="46" y="13" width="3" height="3" fill={body} />
        <path d="M34 24 L41 24 L39 33 L33 33 Z" fill={body} />
      </>
    ),
    shotgun: (
      <>
        <rect x="32" y="14" width="36" height="9" rx="1.5" fill={body} />
        <rect x="68" y="14.5" width="48" height="4" fill={body} />
        <rect x="70" y="19" width="30" height="4.5" rx="1.5" fill={body} opacity="0.85" />
        <path d="M6 16 L34 15 L34 22 L8 27 Z" fill={body} opacity="0.85" />
        <path d="M38 23 L45 23 L43 33 L37 33 Z" fill={body} />
      </>
    ),
    pistol: (
      <>
        <rect x="44" y="13" width="36" height="8" rx="1.5" fill={body} />
        <path d="M48 21 L58 21 L55 36 L46 36 Z" fill={body} opacity="0.9" />
      </>
    ),
    lmg: (
      <>
        <rect x="28" y="13" width="50" height="11" rx="1.5" fill={body} />
        <rect x="78" y="16" width="38" height="3.4" fill={body} />
        <rect x="74" y="14.5" width="18" height="7" rx="1.5" fill={body} opacity="0.85" />
        <path d="M4 15 L30 15 L30 23 L6 28 Z" fill={body} opacity="0.85" />
        <rect x="44" y="24" width="16" height="11" rx="1.5" fill={body} opacity="0.9" />
        <path d="M34 24 L41 24 L39 33 L33 33 Z" fill={body} />
        <path d="M98 19 L93 34 L95.5 34 L100 20 Z M100 19 L106 34 L103.5 34 L98.5 20 Z" fill={body} opacity="0.8" />
        <rect x="42" y="8" width="20" height="3" rx="1.5" fill={body} />
      </>
    ),
    burst: (
      <>
        <rect x="14" y="14" width="62" height="10" rx="2" fill={body} />
        <rect x="76" y="16" width="24" height="5" rx="1" fill={body} opacity="0.85" />
        <rect x="100" y="17.2" width="14" height="2.6" fill={body} />
        <rect x="20" y="24" width="10" height="11" rx="1.5" fill={body} opacity="0.9" />
        <path d="M50 24 L57 24 L55 34 L49 34 Z" fill={body} />
        <rect x="40" y="9" width="22" height="4" rx="1" fill={body} />
      </>
    ),
    dmr: (
      <>
        <rect x="28" y="15" width="44" height="8" rx="1.5" fill={body} />
        <rect x="72" y="16.5" width="44" height="3.2" fill={body} />
        <rect x="72" y="15" width="16" height="6" rx="1" fill={body} opacity="0.85" />
        <path d="M4 15 L30 16 L30 23 L6 27 Z" fill={body} opacity="0.85" />
        <rect x="38" y="8" width="24" height="5" rx="2.5" fill={body} />
        <rect x="48" y="23" width="8" height="9" rx="1" fill={body} opacity="0.9" />
        <path d="M34 23 L41 23 L39 33 L33 33 Z" fill={body} />
      </>
    ),
    autoshot: (
      <>
        <rect x="30" y="13" width="44" height="11" rx="2" fill={body} />
        <rect x="74" y="14.5" width="40" height="5" fill={body} />
        <rect x="74" y="20" width="22" height="3.5" rx="1" fill={body} opacity="0.85" />
        <path d="M6 15 L32 14 L32 22 L8 27 Z" fill={body} opacity="0.85" />
        <circle cx="54" cy="29" r="7.5" fill={body} opacity="0.9" />
        <path d="M36 24 L43 24 L41 34 L35 34 Z" fill={body} />
      </>
    ),
    mp: (
      <>
        <rect x="40" y="13" width="40" height="9" rx="1.5" fill={body} />
        <rect x="80" y="15.5" width="10" height="4" fill={body} />
        <path d="M46 22 L56 22 L54 38 L45 38 Z" fill={body} opacity="0.9" />
        <rect x="58" y="22" width="8" height="5" rx="2" fill="none" stroke={body} strokeWidth="1.6" opacity="0.8" />
      </>
    ),
    magnum: (
      <>
        <rect x="56" y="14" width="44" height="5.5" rx="1.5" fill={body} />
        <rect x="44" y="12" width="16" height="11" rx="3" fill={body} />
        <rect x="36" y="13" width="10" height="7" rx="1.5" fill={body} />
        <path d="M36 20 L46 20 L42 36 L32 35 Z" fill={body} opacity="0.9" />
        <rect x="96" y="11" width="2.6" height="3.5" fill={body} />
      </>
    ),
    rpg: (
      <>
        <rect x="18" y="15" width="78" height="9" rx="2.5" fill={body} />
        <path d="M96 13 L112 16 Q118 19.5 112 23 L96 26 Z" fill={body} />
        <rect x="10" y="14" width="10" height="11" rx="1.5" fill={body} opacity="0.85" />
        <path d="M44 24 L51 24 L49 34 L43 34 Z" fill={body} />
        <path d="M60 24 L66 24 L65 31 L60 31 Z" fill={body} opacity="0.9" />
        <rect x="40" y="10" width="12" height="5" rx="1" fill={body} />
      </>
    ),
    knife: (
      <>
        <path d="M52 17 L104 15 Q114 16 116 20 L52 23 Z" fill={body} />
        <rect x="46" y="13" width="5" height="14" rx="1.5" fill={body} />
        <rect x="18" y="16" width="29" height="8" rx="3" fill={body} opacity="0.85" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 120 40" className={className} aria-hidden>
      {shapes[id]}
    </svg>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-[linear-gradient(90deg,var(--accent-from),var(--accent-to))]" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
    </div>
  );
}

export function LoadoutPicker({
  value,
  onChange,
  compact = false,
  disabled = false,
  keys = false,
  summary = false,
}: {
  value: Loadout;
  onChange: (l: Loadout) => void;
  compact?: boolean;
  disabled?: boolean;
  /** Show the number key for each primary. */
  keys?: boolean;
  /** Compact only: a line on the picked gun (its stats) and perk under the tiles. */
  summary?: boolean;
}) {
  const pickPrimary = (id: WeaponId) => onChange({ ...value, primary: id });
  return (
    <div className={cn("flex w-full flex-col", compact ? "gap-2" : "gap-4")}>
      <div role="radiogroup" aria-label="Primary weapon" className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-2")}>
        {PRIMARIES.map((id, i) => {
          const w = WEAPONS[id];
          const on = value.primary === id;
          return (
            <motion.button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${w.name}, ${w.kind}`}
              disabled={disabled}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              onClick={() => pickPrimary(id)}
              className={cn(
                "relative flex flex-col rounded-2xl border text-left transition-colors disabled:opacity-60",
                compact ? "items-center gap-0.5 px-1.5 py-2" : "gap-2 p-3",
                on ? "border-[var(--accent-from)] bg-[color-mix(in_oklab,var(--accent-from)_14%,transparent)]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
              )}
            >
              {on && !compact && (
                <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-[var(--accent-from)] text-ink-950">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
              <GunGlyph id={id} className={cn("text-ink-100", compact ? "h-5 w-full" : "h-9 w-full")} />
              {keys && <span className="absolute left-1.5 top-1 font-mono text-[9px] text-ink-400">{i + 1}</span>}
              {compact ? (
                <span className="truncate text-[10px] font-bold uppercase tracking-wide">{w.kind.split(" ")[0]}</span>
              ) : (
                <>
                  <span>
                    <span className="block text-sm font-extrabold tracking-tight">{w.name}</span>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-400">{w.kind}</span>
                  </span>
                  <span className="flex flex-col gap-1">
                    <Bar label="Damage" value={w.card.damage} />
                    <Bar label="Range" value={w.card.range} />
                    <Bar label="Rate" value={w.card.rate} />
                    <Bar label="Mobility" value={w.card.mobility} />
                  </span>
                  <span className="hidden text-[11px] leading-snug text-ink-300 sm:block">{w.blurb}</span>
                </>
              )}
            </motion.button>
          );
        })}
      </div>
      {compact && summary && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
          <span className="w-24 shrink-0">
            <span className="block truncate text-xs font-extrabold tracking-tight">{WEAPONS[value.primary].name}</span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-ink-400">+ {WEAPONS.pistol.name}</span>
          </span>
          <span className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1">
            <Bar label="Damage" value={WEAPONS[value.primary].card.damage} />
            <Bar label="Range" value={WEAPONS[value.primary].card.range} />
            <Bar label="Rate" value={WEAPONS[value.primary].card.rate} />
            <Bar label="Mobility" value={WEAPONS[value.primary].card.mobility} />
          </span>
        </div>
      )}
      {!compact && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <GunGlyph id="pistol" className="h-6 w-14 text-ink-200" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{WEAPONS.pistol.name}</span>
            <span className="block text-[11px] text-ink-400">Sidearm, always carried · 2 or Q to swap</span>
          </span>
        </div>
      )}
      <PerkPicker value={value} onChange={onChange} compact={compact} disabled={disabled} />
      {compact && summary && <p className="-mt-0.5 truncate text-center text-[11px] text-ink-400">{PERKS[value.perk].blurb}</p>}
    </div>
  );
}

/** The three perks (on their own on the gun game loadout screen, where the ladder picks the guns). */
export function PerkPicker({ value, onChange, compact = false, disabled = false }: { value: Loadout; onChange: (l: Loadout) => void; compact?: boolean; disabled?: boolean }) {
  const pickPerk = (id: PerkId) => onChange({ ...value, perk: id });
  return (
    <div role="radiogroup" aria-label="Perk" className="grid grid-cols-3 gap-2">
      {PERK_IDS.map((id) => {
        const on = value.perk === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => pickPerk(id)}
            className={cn(
              "rounded-xl border px-2 text-left transition-colors disabled:opacity-60",
              compact ? "py-1.5" : "py-2",
              on ? "border-[var(--accent-to)] bg-[color-mix(in_oklab,var(--accent-to)_14%,transparent)]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
            )}
          >
            <span className="block text-xs font-bold">{PERKS[id].name}</span>
            {!compact && <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-400">{PERKS[id].blurb}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Gun game: the thirteen weapons in the order each kill hands them out. */
export function GunGameLadder({ compact = false, rung = -1 }: { compact?: boolean; rung?: number }) {
  return (
    <div className={cn("glass flex w-full flex-col rounded-2xl px-3", compact ? "gap-1.5 py-2" : "gap-2 py-3")}>
      <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">
        <span>Gun game ladder</span>
        <span className="normal-case tracking-normal text-ink-400">Every kill: the next weapon</span>
      </p>
      <ol className={cn("grid gap-1.5", compact ? "grid-cols-7" : "grid-cols-4 sm:grid-cols-7")}>
        {GUN_GAME_LADDER.map((id, i) => {
          const w = WEAPONS[id];
          const last = i === GUN_GAME_LADDER.length - 1;
          return (
            <li
              key={id}
              title={`${i + 1}. ${w.name}, ${w.kind}`}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5",
                i === rung ? "border-[var(--accent-from)] bg-[color-mix(in_oklab,var(--accent-from)_14%,transparent)]" : i < rung ? "border-white/5 opacity-40" : "border-white/10 bg-white/[0.04]",
                last && i !== rung && "border-[#ffc83d]/50",
              )}
            >
              <span className="absolute left-1.5 top-0.5 font-mono text-[9px] text-ink-400">{i + 1}</span>
              <GunGlyph id={id} className={cn("w-full text-ink-100", compact ? "h-4" : "h-6")} />
              <span className={cn("w-full truncate text-center font-bold uppercase tracking-wide", compact ? "text-[8.5px]" : "text-[10px]", last && "text-[#ffc83d]")}>{compact ? w.kind.split(" ").pop() : w.name}</span>
            </li>
          );
        })}
      </ol>
      {!compact && <p className="text-[11px] leading-snug text-ink-400">No grenades and no sidearm: just the gun in your hands. A kill with the knife wins the match.</p>}
    </div>
  );
}
