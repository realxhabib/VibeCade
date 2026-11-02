/**
 * Host match options: the challenger picks them in the setup screen
 * (purpose "setup", `setup.tsx`) and they arrive as `match.settings`:
 *
 *   { min?: number, kills?: number, season?: "auto" | Season }
 *
 * Missing keys keep the defaults (7 minutes, the standard kill limit, the
 * season of the calendar). `kills: 0` means no kill limit (time only).
 * Everything is clamped, so a hand-made settings blob can't break a match.
 */

import { MATCH_MS } from "./rules";

export type Season = "spring" | "summer" | "autumn" | "winter";
export type SeasonChoice = "auto" | Season;

export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export const SEASON_LABEL: Record<Season, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };
export const SEASON_ICON: Record<Season, string> = { spring: "🌸", summer: "☀️", autumn: "🍂", winter: "❄️" };

/** Minutes the host can pick (the default is 7). */
export const TIME_CHOICES = [3, 5, 7, 10, 15] as const;
/** Kill limits the host can pick (null = the standard one, 0 = none). */
export const KILL_CHOICES = [5, 10, 20, 30, 50] as const;

/** Ranges for a custom value (the host can type any number in them). */
export const MINUTES_RANGE = [1, 30] as const;
export const KILLS_RANGE = [1, 200] as const;

/**
 * Kill limit buttons, lowest first then "no limit" (0): the standard limit
 * (null) takes its place by value, or replaces the button it equals.
 */
export function killChoices(standard: number): (number | null)[] {
  const out: (number | null)[] = KILL_CHOICES.filter((k) => k !== standard);
  const at = out.findIndex((k) => k !== null && k > standard);
  out.splice(at < 0 ? out.length : at, 0, null);
  return [...out, 0];
}

/** "No limit" is stored as a limit nobody reaches in a 30 minute match. */
export const NO_LIMIT = 999;

export interface MatchOptions {
  /** Match length in minutes, or null for the default. */
  minutes: number | null;
  /** Kill limit (per player free for all, per team in team play): null = standard, 0 = no limit. */
  kills: number | null;
  season: SeasonChoice;
}

export const DEFAULT_OPTIONS: MatchOptions = { minutes: null, kills: null, season: "auto" };

const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);

export function parseOptions(raw: unknown): MatchOptions {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_OPTIONS };
  const o = raw as { min?: unknown; kills?: unknown; season?: unknown };
  const kills = o.kills === 0 ? 0 : int(o.kills, KILLS_RANGE[0], KILLS_RANGE[1]);
  const season = typeof o.season === "string" && (SEASONS as readonly string[]).includes(o.season) ? (o.season as Season) : "auto";
  return { minutes: int(o.min, MINUTES_RANGE[0], MINUTES_RANGE[1]), kills, season };
}

/** The settings blob the setup screen submits (only what differs from the defaults). */
export function toSettings(o: MatchOptions): { [key: string]: string | number } {
  const out: { [key: string]: string | number } = {};
  if (o.minutes !== null && o.minutes * 60_000 !== MATCH_MS) out.min = o.minutes;
  if (o.kills !== null) out.kills = o.kills;
  if (o.season !== "auto") out.season = o.season;
  return out;
}

/** Overrides for the match document (`newDoc`). */
export function docOverrides(o: MatchOptions): { dur?: number; lim?: number } {
  const out: { dur?: number; lim?: number } = {};
  if (o.minutes !== null) out.dur = o.minutes * 60_000;
  if (o.kills !== null) out.lim = o.kills === 0 ? NO_LIMIT : o.kills;
  return out;
}

/**
 * The options in force: the host's picks on the loadout screen (kept in the
 * shared state as `{ pre: settings }` until the match starts, so quick
 * matches can change them too), else the challenge's settings. Once the
 * match document exists it carries the length, the limit and the season.
 */
export function optionsFrom(state: unknown, settings: unknown): MatchOptions {
  const base = parseOptions(settings);
  if (!state || typeof state !== "object") return base;
  const s = state as { pre?: unknown; v?: unknown; dur?: unknown; lim?: unknown; s?: unknown };
  if (s.pre && typeof s.pre === "object") return parseOptions(s.pre);
  if (s.v === 1) {
    return {
      minutes: typeof s.dur === "number" ? Math.round(s.dur / 60_000) : base.minutes,
      kills: typeof s.lim === "number" ? (s.lim >= NO_LIMIT ? 0 : s.lim) : base.kills,
      season: typeof s.s === "string" && (SEASONS as readonly string[]).includes(s.s) ? (s.s as Season) : base.season,
    };
  }
  return base;
}

/** Northern-hemisphere meteorological seasons, by the UTC calendar (so every player in a match agrees). */
export function seasonOf(date: Date): Season {
  const m = date.getUTCMonth();
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "autumn";
}

export function resolveSeason(choice: SeasonChoice, now: Date = new Date()): Season {
  return choice === "auto" ? seasonOf(now) : choice;
}

export const isNoLimit = (lim: number): boolean => lim >= NO_LIMIT;

export function minutesOf(o: MatchOptions): number {
  return o.minutes ?? MATCH_MS / 60_000;
}

/** "first to 20", "first team to 40", "no kill limit". */
export function limitLabel(lim: number, teams: boolean): string {
  if (isNoLimit(lim)) return "no kill limit";
  return teams ? `first team to ${lim}` : `first to ${lim}`;
}

/** One line for the challenge card: "10 min · first to 30 · ❄️ Winter". */
export function optionsSummary(o: MatchOptions): string {
  const parts = [`${minutesOf(o)} min`];
  if (o.kills !== null) parts.push(o.kills === 0 ? "no kill limit" : `first to ${o.kills}`);
  if (o.season !== "auto") parts.push(`${SEASON_ICON[o.season]} ${SEASON_LABEL[o.season]}`);
  return parts.join(" · ");
}

/**
 * What each season changes in play (the same for everyone in the match,
 * bots included). Movement is simulated by each player for themselves, so
 * these only need every client to agree on the season.
 */
export interface SeasonRules {
  /** Run speed multiplier. */
  speed: number;
  /** Ground grip (how fast you reach your new velocity; 11 is normal). Crouching always digs in. */
  grip: number;
  /** Jump velocity multiplier. */
  jump: number;
  /** Multiplier on the wait before health starts coming back. */
  regenDelay: number;
  /** Players leave footprints in the snow that everyone can follow. */
  tracks: boolean;
  /** Sprinting through the leaves shows enemies on your minimap. */
  rustle: boolean;
}

export const SEASON_RULES: Record<Season, SeasonRules> = {
  winter: { speed: 1, grip: 4.2, jump: 1, regenDelay: 1, tracks: true, rustle: false },
  autumn: { speed: 1, grip: 11, jump: 1, regenDelay: 1, tracks: false, rustle: true },
  spring: { speed: 1, grip: 11, jump: 1.32, regenDelay: 0.65, tracks: false, rustle: false },
  summer: { speed: 1.1, grip: 11, jump: 1, regenDelay: 1, tracks: false, rustle: false },
};

/** The season's twist in one line (loadout screen, setup, the callout at the start). */
export const SEASON_TWIST: Record<Season, string> = {
  winter: "Icy ground: you slide when you change direction (crouch to dig in), and footprints in the snow give everyone away.",
  autumn: "Crunchy leaves: sprinting enemies show up on your minimap, and so do you.",
  spring: "Spring step: higher jumps to reach new perches, and you heal sooner.",
  summer: "Heat wave: everyone runs 10% faster.",
};
