import { LIMITS } from "vibecade-sdk";
import { achievementDefsError, statDefsError } from "@/platform/catalog";
import type { AchievementDef, StatDef } from "@/platform/types";

/**
 * Stats and achievements as JSON, so a developer can keep them in a file next
 * to their game and paste or upload them instead of typing rows one by one:
 *
 *   { "stats": [{ "key": "best_time", "label": "Best time", "aggregate": "min", "format": "ms" }],
 *     "achievements": [{ "id": "level_1", "name": "Level 1", "icon": "🥉", "xp": 10 }] }
 *
 * A whole manifest works too (other fields are ignored), as does a bare list
 * of stats or of achievements.
 */

export interface ProgressDefs {
  stats: StatDef[];
  achievements: AchievementDef[];
}

/** `replace` swaps in the file's lists; `merge` updates matching keys/ids and appends new ones. */
export type ImportMode = "replace" | "merge";

export type ProgressImport =
  | { ok: true; value: ProgressDefs; /** Lists the file set (a missing list is kept as is). */ touched: { stats: boolean; achievements: boolean }; warnings: string[] }
  | { ok: false; error: string };

const STAT_FIELDS = new Set(["key", "label", "aggregate", "format"]);
const ACHIEVEMENT_FIELDS = new Set(["id", "name", "description", "icon", "xp", "secret"]);

/** "Best time (ms)" → "best_time_ms". */
export function toDefId(text: string): string {
  const id = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "")
    .slice(0, 32);
  return id.replace(/_+$/g, "");
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Pretty JSON of the current definitions, ready to save as a file. */
export function progressToJson({ stats, achievements }: ProgressDefs): string {
  return `${JSON.stringify({ stats, achievements }, null, 2)}\n`;
}

/** Fills the optional fields so hand-written JSON can stay short. */
function normalizeStat(raw: Record<string, unknown>): Record<string, unknown> {
  const label = typeof raw.label === "string" ? raw.label.trim() : raw.label;
  const out: Record<string, unknown> = {
    key: raw.key ?? (typeof label === "string" ? toDefId(label) : undefined),
    label,
    aggregate: raw.aggregate ?? "max",
  };
  if (raw.format !== undefined && raw.format !== null) out.format = raw.format;
  return out;
}

function normalizeAchievement(raw: Record<string, unknown>): Record<string, unknown> {
  const name = typeof raw.name === "string" ? raw.name.trim() : raw.name;
  const out: Record<string, unknown> = {
    id: raw.id ?? (typeof name === "string" ? toDefId(name) : undefined),
    name,
    description: typeof raw.description === "string" ? raw.description.trim() : (raw.description ?? ""),
    icon: typeof raw.icon === "string" ? raw.icon.trim() : (raw.icon ?? "🏆"),
    xp: raw.xp ?? 0,
  };
  if (raw.secret === true) out.secret = true;
  else if (raw.secret !== undefined && raw.secret !== false) out.secret = raw.secret;
  return out;
}

function unknownFields(list: unknown[], allowed: Set<string>, what: string): string[] {
  const warnings: string[] = [];
  list.forEach((item, i) => {
    if (!isPlainObject(item)) return;
    const extra = Object.keys(item).filter((k) => !allowed.has(k));
    if (extra.length) warnings.push(`${what} ${i + 1}: ignored ${extra.map((k) => `"${k}"`).join(", ")}`);
  });
  return warnings;
}

function mergeBy<T>(current: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const out = [...current];
  for (const item of incoming) {
    const at = out.findIndex((c) => keyOf(c) === keyOf(item));
    if (at >= 0) out[at] = item;
    else out.push(item);
  }
  return out;
}

/** A bare list is stats when its items have a `key`, achievements when they have an `id`. */
function splitTopLevel(data: unknown): { stats?: unknown; achievements?: unknown } | string {
  if (Array.isArray(data)) {
    if (!data.length) return "That list is empty. Use { \"stats\": [], \"achievements\": [] } to clear them";
    const first = data[0];
    if (isPlainObject(first) && "key" in first) return { stats: data };
    if (isPlainObject(first) && ("id" in first || "xp" in first || "icon" in first)) return { achievements: data };
    return "A bare list needs stats (with \"key\") or achievements (with \"id\")";
  }
  if (!isPlainObject(data)) return "Expected an object with \"stats\" and/or \"achievements\"";
  // A full manifest, or one wrapped as { "manifest": { ... } }.
  const source = isPlainObject(data.manifest) && !("stats" in data) && !("achievements" in data) ? data.manifest : data;
  if (!("stats" in source) && !("achievements" in source)) return "No \"stats\" or \"achievements\" found in that JSON";
  return { stats: source.stats, achievements: source.achievements };
}

/** Parses pasted or uploaded JSON against the current definitions. Nothing changes unless it all validates. */
export function importProgressJson(text: string, current: ProgressDefs, mode: ImportMode = "replace"): ProgressImport {
  if (!text.trim()) return { ok: false, error: "Paste some JSON first" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const split = splitTopLevel(data);
  if (typeof split === "string") return { ok: false, error: split };

  const touched = { stats: split.stats !== undefined, achievements: split.achievements !== undefined };
  const warnings: string[] = [];
  let stats = current.stats;
  let achievements = current.achievements;

  if (touched.stats) {
    const raw = split.stats === null ? [] : split.stats;
    if (!Array.isArray(raw)) return { ok: false, error: "\"stats\" must be a list" };
    warnings.push(...unknownFields(raw, STAT_FIELDS, "Stat"));
    const incoming = raw.map((item) => (isPlainObject(item) ? normalizeStat(item) : item));
    const error = statDefsError(incoming);
    if (error) return { ok: false, error };
    stats = mode === "merge" ? mergeBy(current.stats, incoming as StatDef[], (s) => s.key) : (incoming as StatDef[]);
  }
  if (touched.achievements) {
    const raw = split.achievements === null ? [] : split.achievements;
    if (!Array.isArray(raw)) return { ok: false, error: "\"achievements\" must be a list" };
    warnings.push(...unknownFields(raw, ACHIEVEMENT_FIELDS, "Achievement"));
    const incoming = raw.map((item) => (isPlainObject(item) ? normalizeAchievement(item) : item));
    const error = achievementDefsError(incoming);
    if (error) return { ok: false, error };
    achievements = mode === "merge" ? mergeBy(current.achievements, incoming as AchievementDef[], (a) => a.id) : (incoming as AchievementDef[]);
  }

  // Merging can push the combined lists past the limits each half passed on its own.
  if (mode === "merge") {
    if (stats.length > LIMITS.maxStats) return { ok: false, error: `Merged, that's ${stats.length} stats (up to ${LIMITS.maxStats})` };
    const combined = achievementDefsError(achievements);
    if (combined) return { ok: false, error: `After merging: ${combined}` };
  }
  return { ok: true, value: { stats, achievements }, touched, warnings };
}

/** One-line summary of what an import changes, e.g. "3 stats · 12 achievements (240 XP)". */
export function describeProgress({ stats, achievements }: ProgressDefs): string {
  const xp = achievements.reduce((sum, a) => sum + a.xp, 0);
  const s = `${stats.length} stat${stats.length === 1 ? "" : "s"}`;
  const a = `${achievements.length} achievement${achievements.length === 1 ? "" : "s"}`;
  return `${s} · ${a} (${xp} XP)`;
}
