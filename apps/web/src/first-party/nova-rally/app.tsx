"use client";

/**
 * Nova Rally root. Setup purpose: the challenge form (setup.tsx). Match
 * purpose: the garage (pick a ship, pilot, paint and parts, see the race)
 * which calls `ready()` when you hit Start engines, then the race or Grand
 * Prix once the host fires `match.start`.
 */

import { useMatchStarted, usePlayers, useXApps } from "@xapps/sdk/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { ItemIcon } from "./icons";
import { ITEMS, type ItemId } from "./items";
import { formatTime, parseSettings } from "./logic";
import { MatchView } from "./match";
import { HangarScene } from "./hangar";
import { Disclosure, GOLD, RaceInfo, Segmented } from "./menu-ui";
import { autoQuality, loadQualityChoice, saveQualityChoice, type QualityChoice } from "./scene";
import { bestTrialTime, cleanParts, liveryFor, type ShipChoice } from "./race";
import { LIVERY_SWATCHES, PILOTS, SHIPS, THRUSTERS, WINGS, applyParts, pilotPortraitSvg, shipIconSvg, type ShipPart } from "./ships";
import { Setup } from "./setup";
import { TRACKS } from "./tracks";

const CHOICE_KEY = "nova-rally:ship";

function loadChoice(): ShipChoice {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CHOICE_KEY) ?? "null") as ShipChoice | null;
    if (raw && typeof raw.design === "number" && typeof raw.livery === "number") {
      return {
        design: Math.abs(raw.design) % SHIPS.length,
        livery: Math.max(-1, Math.min(LIVERY_SWATCHES.length - 1, raw.livery)),
        pilot: typeof raw.pilot === "number" ? Math.abs(raw.pilot) % PILOTS.length : 0,
        parts: cleanParts(raw.parts),
      };
    }
  } catch {
    // First visit.
  }
  return { design: 0, livery: -1, pilot: 0 };
}

export function NovaRallyApp() {
  const xapps = useXApps();
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#07051a]">
      {xapps.purpose === "setup" ? <Setup /> : <Race />}
    </div>
  );
}

function Race() {
  const started = useMatchStarted();
  const [choice, setChoice] = useState<ShipChoice | null>(null);
  const [locked, setLocked] = useState<ShipChoice | null>(null);
  const [trial, setTrial] = useState<{ track: string; run: number } | null>(null);
  const xapps = useXApps();
  const readyRef = useRef(false);

  useEffect(() => {
    xapps.ui.setStatus("In the garage").catch(() => {});
  }, [xapps]);

  const ready = (c: ShipChoice) => {
    setLocked(c);
    try {
      window.localStorage.setItem(CHOICE_KEY, JSON.stringify(c));
    } catch {
      // Private mode.
    }
    if (readyRef.current) return;
    readyRef.current = true;
    xapps.ready().catch((error: unknown) => console.warn("[nova-rally] ready failed", error));
    xapps.ui.setStatus("Engines hot").catch(() => {});
  };

  // Spectators never pick a ship.
  useEffect(() => {
    if (!xapps.isSpectator || readyRef.current) return;
    readyRef.current = true;
    xapps.ready().catch(() => {});
  }, [xapps]);

  const active = locked ?? choice;
  return (
    <AnimatePresence mode="wait">
      {started ? (
        <motion.div key="race" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <MatchView choice={active ?? loadChoice()} />
        </motion.div>
      ) : trial ? (
        <motion.div key={`trial${trial.run}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <MatchView
            choice={active ?? loadChoice()}
            trial={trial.track}
            onExit={() => setTrial(null)}
            onRetry={() => setTrial((t) => (t ? { ...t, run: t.run + 1 } : t))}
          />
        </motion.div>
      ) : (
        <motion.div key="garage" className="absolute inset-0 overflow-y-auto" exit={{ opacity: 0, scale: 1.04, filter: "blur(10px)" }} transition={{ duration: 0.35 }}>
          <Garage onChange={setChoice} onReady={ready} locked={!!locked} onTrial={(track) => setTrial({ track, run: 0 })} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatBar({ label, value, base = value }: { label: string; value: number; base?: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/75">
      <span className="w-16">{label}</span>
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((k) => (
          <motion.span
            key={k}
            className="h-2 flex-1 rounded-full"
            animate={{
              backgroundColor: k <= value ? (k > base ? "#5dffb0" : "#ffd166") : k <= base ? "rgba(255,90,110,0.55)" : "rgba(255,255,255,0.14)",
            }}
            transition={{ duration: 0.2, delay: k * 0.03 }}
          />
        ))}
      </div>
    </div>
  );
}

type GarageTab = "ship" | "pilot" | "paint" | "parts";

function Garage({
  onChange,
  onReady,
  onTrial,
  locked,
}: {
  onChange: (c: ShipChoice) => void;
  onReady: (c: ShipChoice) => void;
  onTrial: (track: string) => void;
  locked: boolean;
}) {
  const xapps = useXApps();
  const reduced = useReducedMotion() ?? false;
  const { players, me } = usePlayers();
  const [choice, setChoice] = useState<ShipChoice>(() => (typeof window === "undefined" ? { design: 0, livery: -1, pilot: 0 } : loadChoice()));
  const pilot = PILOTS[(choice.pilot ?? 0) % PILOTS.length]!;
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const settings = parseSettings(xapps.match.settings);
  const design = SHIPS[choice.design]!;
  const livery = liveryFor(design, choice.livery);
  const stats = applyParts(design.stats, choice.parts);
  const parts = choice.parts ?? { thruster: 0, wing: 0 };
  const [autoLeft, setAutoLeft] = useState(40);
  const [tab, setTab] = useState<GarageTab>("ship");

  useEffect(() => {
    onChange(choice);
  }, [choice, onChange]);

  // Don't hold the table forever: start engines by yourself after 40 s.
  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => setAutoLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [locked]);
  useEffect(() => {
    if (autoLeft <= 0 && !locked) onReady(choice);
  }, [autoLeft, locked, onReady, choice]);

  const pick = (c: ShipChoice) => {
    if (locked) return;
    play("tick");
    setChoice(c);
  };

  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const showcase: ItemId[] = ["seeker", "singularity", "warp", "emp", "shield", "mine", "cloak", "nitro3"];
  const races = settings.cup.tracks.length;
  const tile = (selected: boolean) => ({
    borderColor: selected ? GOLD : "rgba(255,255,255,0.12)",
    background: selected ? "rgba(255,209,102,0.16)" : "rgba(255,255,255,0.05)",
    opacity: locked && !selected ? 0.4 : 1,
  });

  return (
    <div className="relative min-h-full w-full text-white">
      {/* The 3D hangar fills the screen behind the menus (top band on phones). */}
      <div className="fixed inset-x-0 top-0 h-[60vh] md:inset-0 md:h-auto">
        <HangarScene design={design} livery={livery} pilot={pilot} parts={choice.parts} reduced={reduced} focusX={wide ? 0.33 : 0.5} className="size-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#07051a]/70 via-transparent to-[#07051a] md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-[#07051a]/80" />
      </div>

      <div className="pointer-events-none relative mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3 px-4 pb-32 pt-4 md:grid md:grid-cols-[1fr_410px] md:items-start md:gap-6 md:pb-5 md:pt-5">
        {/* Left: the title and what we're racing, then the ship's card. */}
        <div className="flex flex-col gap-3 md:sticky md:top-5 md:min-h-[calc(100dvh-40px)] md:justify-between">
          <header className="flex flex-col items-center gap-2.5 text-center md:items-start md:text-left">
            <h1
              className="font-display text-[clamp(40px,11vw,76px)] font-black italic leading-[0.9] tracking-tight"
              style={{
                backgroundImage: "linear-gradient(180deg, #ffffff 15%, #ffd166 55%, #ff5ad1 95%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextStroke: "2px rgba(20,8,50,0.9)",
                filter: "drop-shadow(0 5px 0 rgba(0,0,0,0.5))",
              }}
            >
              NOVA RALLY
            </h1>
            <RaceInfo settings={settings} align={wide ? "start" : "center"} />
          </header>
          <div className="h-[19vh] md:hidden" />
          <div className="w-full rounded-3xl bg-[rgba(10,6,30,0.62)] px-4 py-3 ring-1 ring-white/10 backdrop-blur-md md:max-w-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[22px] font-black italic leading-none">{design.name}</span>
              <span className="shrink-0 text-[11.5px] font-semibold text-white/50">↻ Drag to spin</span>
            </div>
            <p className="mt-1 text-[12.5px] text-white/65">{design.tagline}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 md:grid-cols-1">
              <StatBar label="Speed" value={stats.speed} base={design.stats.speed} />
              <StatBar label="Accel" value={stats.accel} base={design.stats.accel} />
              <StatBar label="Handling" value={stats.handling} base={design.stats.handling} />
              <StatBar label="Weight" value={stats.weight} base={design.stats.weight} />
            </div>
          </div>
        </div>

        {/* Right: kit out the ship, start engines, then the extras. */}
        <div className="pointer-events-auto flex flex-col gap-2.5 md:max-h-[calc(100dvh-40px)] md:overflow-y-auto md:pb-1">
          <div className="flex flex-col gap-3 rounded-3xl bg-[rgba(10,6,30,0.74)] p-3 ring-1 ring-white/10 backdrop-blur-md">
            <Segmented<GarageTab>
              id="garage-tab"
              label="Customise"
              value={tab}
              onChange={setTab}
              options={[
                { value: "ship", label: "Ship" },
                { value: "pilot", label: "Pilot" },
                { value: "paint", label: "Paint" },
                { value: "parts", label: "Parts" },
              ]}
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                className="min-h-[188px]"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={reduced ? { duration: 0.1 } : spring.snappy}
              >
                {tab === "ship" ? (
                  <div className="grid grid-cols-4 gap-2">
                    {SHIPS.map((s, i) => {
                      const selected = i === choice.design;
                      return (
                        <motion.button
                          key={s.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => pick({ ...choice, design: i })}
                          whileTap={{ scale: 0.94 }}
                          className="flex flex-col items-center gap-1 rounded-2xl border-2 px-1 pb-2 pt-1.5"
                          style={tile(selected)}
                        >
                          <span className="block h-10 w-16" dangerouslySetInnerHTML={{ __html: shipIconSvg(s, liveryFor(s, selected ? choice.livery : -1)) }} />
                          <span className="w-full text-center text-[11px] font-bold leading-tight">{s.name}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : tab === "pilot" ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="grid grid-cols-4 gap-2">
                      {PILOTS.map((pl, i) => {
                        const selected = i === (choice.pilot ?? 0);
                        return (
                          <motion.button
                            key={pl.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => pick({ ...choice, pilot: i })}
                            whileTap={{ scale: 0.94 }}
                            className="flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-1.5"
                            style={tile(selected)}
                          >
                            <span
                              className="block size-11 overflow-hidden rounded-full"
                              style={{ boxShadow: selected ? `0 0 14px ${pl.color}` : "none" }}
                              dangerouslySetInnerHTML={{ __html: pilotPortraitSvg(pl).replace("<svg", '<svg width="100%" height="100%"') }}
                            />
                            <span className="w-full text-center text-[11px] font-bold leading-tight">{pl.name.replace("Captain ", "")}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                    <p className="px-1 text-[12.5px] text-white/70">
                      <b className="text-white">{pilot.name}</b> · {pilot.species} · {pilot.tagline}
                    </p>
                  </div>
                ) : tab === "paint" ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-5 gap-2.5 px-1">
                      {[-1, ...LIVERY_SWATCHES.map((_, i) => i)].map((li) => {
                        const l = liveryFor(design, li);
                        const selected = li === choice.livery;
                        return (
                          <motion.button
                            key={li}
                            type="button"
                            aria-label={li < 0 ? "Factory paint" : `Paint ${li + 1}`}
                            aria-pressed={selected}
                            onClick={() => pick({ ...choice, livery: li })}
                            whileTap={{ scale: 0.9 }}
                            className="mx-auto aspect-square w-full max-w-12 rounded-full border-[3px]"
                            style={{
                              background: `conic-gradient(${l.primary} 0 50%, ${l.secondary} 50% 80%, ${l.glow} 80%)`,
                              borderColor: selected ? "#fff" : "rgba(255,255,255,0.15)",
                              boxShadow: selected ? `0 0 14px ${l.glow}` : "none",
                              opacity: locked && !selected ? 0.4 : 1,
                            }}
                          />
                        );
                      })}
                    </div>
                    <p className="px-1 text-[12.5px] text-white/70">{choice.livery < 0 ? `Factory paint for the ${design.name}` : "Custom paint: primary, trim and engine glow"}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <PartRow label="Thrusters" parts={THRUSTERS} value={parts.thruster} locked={locked} onPick={(i) => pick({ ...choice, parts: cleanParts({ ...parts, thruster: i }) })} />
                    <PartRow label="Wings" parts={WINGS} value={parts.wing} locked={locked} onPick={(i) => pick({ ...choice, parts: cleanParts({ ...parts, wing: i }) })} />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <ul className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
              <li className="mr-1 text-[12px] font-bold uppercase tracking-wider text-white/50">Grid</li>
              {seated.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-3 text-[12px]">
                  <Avatar person={p} size={22} />
                  <span className="max-w-24 truncate font-semibold">{p.id === me.id ? "You" : p.isBot ? p.name : `@${p.handle}`}</span>
                </li>
              ))}
              {seated.length < 8 ? <li className="rounded-full bg-white/5 px-3 py-1 text-[12px] text-white/60">+{8 - seated.length} CPU</li> : null}
            </ul>
          </div>

          {/* Phones: pinned to the bottom so it's always in reach. */}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#07051a] via-[#07051a]/90 to-transparent px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-10 md:static md:z-auto md:bg-none md:p-0">
            <motion.button
              type="button"
              disabled={locked}
              onClick={() => {
                play("go");
                onReady(choice);
              }}
              whileTap={{ scale: 0.97 }}
              className="pointer-events-auto mx-auto block w-full max-w-lg rounded-2xl px-5 py-3.5 text-lg font-black italic text-[#2a1400] disabled:opacity-80 md:max-w-none"
              style={{ background: "linear-gradient(180deg, #ffe27a, #ff9a1f)", boxShadow: "0 5px 0 #9a4b00, 0 0 30px rgba(255,160,40,0.4)" }}
            >
              {locked ? "Engines hot — waiting for the grid…" : `Start engines (${Math.max(0, autoLeft)})`}
            </motion.button>
          </div>

          <Disclosure icon="⏱" title="Time trial" hint="Race your ghost while you wait · nothing is submitted">
            <TimeTrials onTrial={onTrial} />
          </Disclosure>
          <Disclosure icon="📖" title="How to race" hint="Controls, drifts, boosts and items">
            <ul className="flex flex-col gap-1.5 text-[12.5px] leading-snug text-white/80">
              <li>
                <b className="text-white">Controls</b> · ↑/W thrust, ←/→ steer, Space drift, E item (hold ↓ to fire behind). On phones the ship accelerates by itself.
              </li>
              <li>
                <b className="text-white">Drift</b> · hold drift while turning to charge blue → orange → purple mini-turbos, then let go to boost.
              </li>
              <li>
                <b className="text-white">Rocket start</b> · hold throttle as the last red light goes out.
              </li>
              <li>
                <b className="text-white">Tricks and jumps</b> · press drift in the air off a ramp for a boost; hold drift going straight, then release for a charge jump.
              </li>
              <li>
                <b className="text-white">Speed</b> · tuck in behind a rival to slipstream, and grab stardust (up to 10) for a higher top speed.
              </li>
              <li>
                <b className="text-white">Points</b> · 15-12-10-8-6-4-2-1 by finishing place{races > 1 ? `; most points after ${races} races wins` : ""}.
              </li>
            </ul>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {showcase.map((id) => (
                <div key={id} className="flex flex-col items-center text-center text-[10.5px] font-semibold leading-tight text-white/75">
                  <ItemIcon id={id} className="size-9" />
                  {ITEMS[id].name}
                </div>
              ))}
            </div>
          </Disclosure>
          <Disclosure icon="🎛" title="Graphics" hint="Auto, High, Medium or Low">
            <QualityPicker />
          </Disclosure>
        </div>
      </div>
    </div>
  );
}

const STAT_SHORT: Record<string, string> = { speed: "SPD", accel: "ACC", handling: "HDL", weight: "WGT" };

function PartRow({ label, parts, value, locked, onPick }: { label: string; parts: readonly ShipPart[]; value: number; locked: boolean; onPick: (i: number) => void }) {
  const current = parts[value] ?? parts[0]!;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
        <span className="text-[12px] font-bold uppercase tracking-wider text-white/55">{label}</span>
        <span className="truncate text-[12px] text-white/70">{current.blurb}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {parts.map((part, i) => {
          const selected = i === value;
          const mods = Object.entries(part.mods).filter(([, v]) => v);
          return (
            <motion.button
              key={part.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(i)}
              whileTap={{ scale: 0.94 }}
              className="flex flex-col items-center gap-0.5 rounded-xl border-2 px-1 py-1.5 text-center"
              style={{
                borderColor: selected ? GOLD : "rgba(255,255,255,0.12)",
                background: selected ? "rgba(255,209,102,0.16)" : "rgba(255,255,255,0.05)",
                opacity: locked && !selected ? 0.4 : 1,
              }}
            >
              <span className="text-[12px] font-black italic leading-tight text-white">{part.name}</span>
              <span className="flex gap-1 text-[10.5px] font-bold">
                {mods.length ? (
                  mods.map(([k, v]) => (
                    <span key={k} style={{ color: v! > 0 ? "#5dffb0" : "#ff7a8a" }}>
                      {v! > 0 ? "+" : "−"}
                      {STAT_SHORT[k]}
                    </span>
                  ))
                ) : (
                  <span className="text-white/50">balanced</span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

const QUALITY_OPTIONS: readonly { id: QualityChoice; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

const QUALITY_BLURB: Record<QualityChoice, string> = {
  auto: "Picks for this device",
  high: "Full effects, sharpest picture",
  medium: "Lighter world at 1× resolution",
  low: "For phones and older laptops",
};

function QualityPicker() {
  const [choice, setChoice] = useState<QualityChoice>(() => (typeof window === "undefined" ? "auto" : loadQualityChoice()));
  const auto = typeof window === "undefined" ? "medium" : autoQuality();
  return (
    <div className="flex flex-col gap-2">
      <Segmented<QualityChoice>
        id="quality"
        label="Graphics quality"
        value={choice}
        onChange={(c) => {
          setChoice(c);
          saveQualityChoice(c);
        }}
        options={QUALITY_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
      />
      <p className="px-1 text-[12px] text-white/60">
        {QUALITY_BLURB[choice]}
        {choice === "auto" ? ` (${auto[0]!.toUpperCase()}${auto.slice(1)} here)` : " · applies from the next race"}
      </p>
    </div>
  );
}

function TimeTrials({ onTrial }: { onTrial: (track: string) => void }) {
  const [bests] = useState(() => Object.fromEntries(TRACKS.map((t) => [t.id, bestTrialTime(t.id)])));
  return (
    <div className="grid grid-cols-2 gap-2">
      {TRACKS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            play("pop");
            onTrial(t.id);
          }}
          className="flex flex-col items-start rounded-xl px-3 py-2 text-left"
          style={{ background: `linear-gradient(135deg, ${t.accent[0]}44, ${t.accent[1]}22)`, boxShadow: `inset 0 0 0 1px ${t.accent[0]}88` }}
        >
          <span className="text-[13px] font-black italic text-white">{t.name}</span>
          <span className="font-mono text-[11.5px] text-white/75">{bests[t.id] ? `Best ${formatTime(bests[t.id]!)}` : "No time yet"}</span>
        </button>
      ))}
    </div>
  );
}
