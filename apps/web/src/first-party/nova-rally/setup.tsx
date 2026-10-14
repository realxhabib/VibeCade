"use client";

/**
 * Challenge setup (purpose "setup"): the challenger picks the mode (race,
 * knockout or battle), a single track or a cup, the speed class, laps and
 * mirror. Fits the host's setup sheet: a short scrolling form with the
 * Challenge button pinned to the bottom.
 */

import { useSetup, useXApps } from "@xapps/sdk/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { SPEED_CLASSES, parseSettings, type SpeedClass } from "./logic";
import { GOLD, Segmented } from "./menu-ui";
import { ARENAS, CUPS, TRACKS, trackById } from "./tracks";
import type { ThemeId } from "./types";

type Mode = "race" | "knockout" | "battle";

const MODE_BLURB: Record<Mode, string> = {
  race: "Eight ships, items on. First across the line wins.",
  knockout: "Whoever is last gets knocked out at intervals until two are left to duel it out.",
  battle: "Three shield orbs each in an open arena. Last ship flying wins.",
};

const WORLD: Record<ThemeId, string> = {
  mars: "Mars",
  belt: "Asteroid belt",
  saturn: "Saturn's rings",
  nebula: "Nebula station",
  luna: "The Moon",
  sun: "The Sun",
  europa: "Europa",
};

export function Setup() {
  const xapps = useXApps();
  const reduced = useReducedMotion() ?? false;
  const { submit, cancel, settings: initial } = useSetup();
  const [start] = useState(() => parseSettings(initial));
  const startSingle = start.cup.tracks.length === 1 && !start.battle;
  const [mode, setMode] = useState<Mode>(start.battle ? "battle" : start.knockout ? "knockout" : "race");
  const [event, setEvent] = useState<"single" | "cup">(startSingle || start.battle ? "single" : "cup");
  const [track, setTrack] = useState(startSingle ? start.cup.tracks[0]! : TRACKS[0]!.id);
  const [cup, setCup] = useState(!startSingle && CUPS.some((c) => c.id === start.cup.id) ? start.cup.id : CUPS[0]!.id);
  const [arena, setArena] = useState(start.battle && start.cup.tracks.length === 1 ? start.cup.tracks[0]! : "all");
  const [cc, setCc] = useState<SpeedClass>(start.cc);
  const [laps, setLaps] = useState(start.laps);
  const [mirror, setMirror] = useState(start.mirror);
  const [busy, setBusy] = useState(false);
  const readied = useRef(false);

  // Lift the host's loading cover: the form is ready to use.
  useEffect(() => {
    if (readied.current) return;
    readied.current = true;
    xapps.ready().catch(() => {});
  }, [xapps]);

  const battle = mode === "battle";
  const cupDef = CUPS.find((c) => c.id === cup) ?? CUPS[0]!;
  const name = battle ? (arena === "all" ? "Battle Cup" : trackById(arena).name) : event === "single" ? trackById(track).name : cupDef.name;

  const send = () => {
    setBusy(true);
    play("go");
    if (battle) {
      const settings: { [key: string]: string | number | boolean } = { mode: "battle", cc };
      if (arena !== "all") settings.track = arena;
      submit(settings, `⚔️ Battle · ${name} · ${cc}cc`).catch(() => setBusy(false));
      return;
    }
    const settings: { [key: string]: string | number | boolean } = event === "single" ? { track, cc, laps } : { cup, cc, laps };
    if (mirror) settings.mirror = true;
    if (mode === "knockout") settings.mode = "knockout";
    const extras = [mode === "knockout" ? "knockout" : "", mirror ? "mirror" : ""].filter(Boolean).join(" · ");
    submit(settings, `${name} · ${cc}cc · ${laps} ${laps === 1 ? "lap" : "laps"}${extras ? ` · ${extras}` : ""}`).catch(() => setBusy(false));
  };

  const card = (selected: boolean) =>
    `relative flex flex-col items-start overflow-hidden rounded-2xl px-3 py-2.5 text-left transition-[box-shadow,opacity] ${selected ? "" : "opacity-80 hover:opacity-100"}`;
  const ring = (selected: boolean, color: string) => ({
    boxShadow: selected ? `inset 0 0 0 2px ${GOLD}, 0 0 18px ${GOLD}44` : `inset 0 0 0 1px ${color}88`,
  });
  const pickSound = (fn: () => void) => () => {
    play("tick");
    fn();
  };

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-5">
        <h1 className="font-display text-[26px] font-black italic leading-none">Set up the race</h1>

        <Section title="Mode">
          <Segmented<Mode>
            id="mode"
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "race", label: "🏁 Race" },
              { value: "knockout", label: "💥 Knockout" },
              { value: "battle", label: "⚔️ Battle" },
            ]}
          />
          <p className="px-1 text-[12.5px] leading-snug text-white/65">{MODE_BLURB[mode]}</p>
        </Section>

        {battle ? (
          <Section title="Arena">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={card(arena === "all")}
                style={{ background: "linear-gradient(135deg, #b18cff40, #ff5ad11f)", ...ring(arena === "all", "#b18cff") }}
                onClick={pickSound(() => setArena("all"))}
              >
                <span className="text-[14px] font-black italic">⚔️ Battle Cup</span>
                <span className="text-[11.5px] text-white/60">All three arenas</span>
              </button>
              {ARENAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={card(arena === a.id)}
                  style={{ background: `linear-gradient(135deg, ${a.accent[0]}40, ${a.accent[1]}1f)`, ...ring(arena === a.id, a.accent[0]) }}
                  onClick={pickSound(() => setArena(a.id))}
                >
                  <span className="text-[14px] font-black italic">{a.name}</span>
                  <span className="text-[11.5px] text-white/60">{WORLD[a.theme]}</span>
                </button>
              ))}
            </div>
          </Section>
        ) : (
          <Section title="Track">
            <Segmented
              id="event"
              label="Event"
              value={event}
              onChange={setEvent}
              options={[
                { value: "single", label: "Single race" },
                { value: "cup", label: "Grand Prix" },
              ]}
            />
            <motion.div
              key={event}
              className="grid grid-cols-2 gap-2"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.snappy}
            >
              {event === "single"
                ? TRACKS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={card(track === t.id)}
                      style={{ background: `linear-gradient(135deg, ${t.accent[0]}48, ${t.accent[1]}1f)`, ...ring(track === t.id, t.accent[0]) }}
                      onClick={pickSound(() => setTrack(t.id))}
                    >
                      <span className="text-[14px] font-black italic leading-tight">{t.name}</span>
                      <span className="text-[11.5px] text-white/60">{WORLD[t.theme]}</span>
                    </button>
                  ))
                : CUPS.map((c) => (
                    <button key={c.id} type="button" className={`${card(cup === c.id)} col-span-2 bg-white/[0.05]`} style={ring(cup === c.id, "#ffffff")} onClick={pickSound(() => setCup(c.id))}>
                      <span className="text-[14px] font-black italic">
                        {c.icon} {c.name} <span className="text-[11.5px] font-bold not-italic text-white/55">· {c.tracks.length} races</span>
                      </span>
                      <span className="text-[11.5px] text-white/60">{c.tracks.map((t) => trackById(t).name).join(" → ")}</span>
                    </button>
                  ))}
            </motion.div>
          </Section>
        )}

        <Section title="Speed class">
          <Segmented<SpeedClass> id="cc" label="Speed class" value={cc} onChange={setCc} options={SPEED_CLASSES.map((s) => ({ value: s.cc, label: s.label }))} />
        </Section>

        {battle ? null : (
          <>
            <Section title="Laps">
              <Segmented<number> id="laps" label="Laps per race" value={laps} onChange={setLaps} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n }))} />
            </Section>
            <button
              type="button"
              role="switch"
              aria-checked={mirror}
              onClick={pickSound(() => setMirror((m) => !m))}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-3.5 py-3 text-left ring-1 ring-white/10"
            >
              <span className="text-lg leading-none" aria-hidden>
                🪞
              </span>
              <span className="flex-1">
                <span className="block text-[13.5px] font-bold">Mirror mode</span>
                <span className="block text-[12px] text-white/55">Every track flipped left to right</span>
              </span>
              <span className="relative h-6 w-10 rounded-full transition-colors" style={{ background: mirror ? GOLD : "rgba(255,255,255,0.18)" }}>
                <motion.span
                  className="absolute top-0.5 size-5 rounded-full bg-white shadow"
                  animate={{ left: mirror ? 18 : 2 }}
                  transition={reduced ? { duration: 0 } : spring.snappy}
                />
              </span>
            </button>
          </>
        )}
      </div>

      <div className="flex gap-2 border-t border-white/10 bg-[#0b0822]/95 px-4 py-3 backdrop-blur">
        <button type="button" className="rounded-2xl px-4 py-3 text-[14px] font-bold text-white/80 ring-1 ring-white/20" onClick={() => cancel().catch(() => {})}>
          Cancel
        </button>
        <motion.button
          type="button"
          disabled={busy}
          whileTap={{ scale: 0.97 }}
          className="flex min-w-0 flex-1 flex-col items-center rounded-2xl px-3 py-2 text-[#2a1400] disabled:opacity-70"
          style={{ background: "linear-gradient(180deg, #ffe27a, #ff9a1f)", boxShadow: "0 4px 0 #9a4b00" }}
          onClick={send}
        >
          <span className="text-[16px] font-black italic leading-tight">Send challenge</span>
          <span className="w-full truncate text-[11.5px] font-bold leading-tight opacity-75">
            {name} · {cc}cc{battle ? "" : ` · ${laps} ${laps === 1 ? "lap" : "laps"}`}
          </span>
        </motion.button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className="px-1 text-[12px] font-bold uppercase tracking-wider text-white/55">{title}</h2>
      {children}
    </section>
  );
}
