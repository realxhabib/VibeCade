/**
 * vibecade.manifest.json checks, using the same validators as the VibeCade
 * site (bundled from apps/web at build time), so "valid here" means "the
 * registration form and the version editor accept it".
 */
import { LIMITS } from "vibecade-sdk";
import { versionManifestError, versionUrlError, SEMVER_PATTERN } from "@/platform/shipping";
import { isSingleEmoji } from "@/platform/catalog";
import { CATEGORIES } from "@/platform/types";
import { describeProgress, importProgressJson, type ImportMode, type ProgressDefs } from "@/components/pages/progress-json";
import type { AchievementDef, StatDef } from "@/platform/types";

export const MANIFEST_FILE = "vibecade.manifest.json";

/** Fields VibeCade reads from a manifest (the version manifest, plus the hosted URL and a version label). */
export const KNOWN_FIELDS = new Set([
  "$schema",
  "name",
  "version",
  "url",
  "tagline",
  "description",
  "category",
  "kind",
  "icon",
  "iconImage",
  "coverImage",
  "accent",
  "modes",
  "players",
  "teams",
  "spectators",
  "setup",
  "turnBased",
  "scoring",
  "votesToWin",
  "durationLabel",
  "howTo",
  "authority",
  "stats",
  "achievements",
]);

const REQUIRED = ["name", "tagline", "category", "icon", "accent", "modes", "scoring"] as const;

/** A manifest every check accepts; single fields are tried against it to report every problem, not just the first. */
const BASELINE = {
  name: "Valid Name",
  tagline: "A tagline",
  description: "",
  category: "games",
  kind: "game",
  icon: "🎮",
  accent: ["#8b5cf6", "#22d3ee"],
  modes: ["live", "practice"],
  players: { min: 2, max: 8 },
  teams: 0,
  spectators: true,
  setup: false,
  turnBased: false,
  scoring: "high",
  howTo: [],
  stats: [],
  achievements: [],
} as Record<string, unknown>;

export interface ManifestReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function placeholders(value: unknown, path: string, out: string[]) {
  if (typeof value === "string") {
    if (/\{\{\s*\w+\s*\}\}/.test(value)) out.push(`${path} still has a template placeholder (${value.slice(0, 40)})`);
  } else if (Array.isArray(value)) value.forEach((v, i) => placeholders(v, `${path}[${i}]`, out));
  else if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) placeholders(v, path ? `${path}.${k}` : k, out);
}

/** Checks a parsed manifest. Errors block registration; warnings are things that work but likely aren't what you want. */
export function checkManifest(input: unknown): ManifestReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["The manifest must be a JSON object"], warnings, summary: "" };
  const m = input;

  placeholders(m, "", errors);
  for (const field of REQUIRED) if (m[field] === undefined) errors.push(`Missing "${field}"`);

  // Each field on its own through the site's validator (fields that are only
  // valid together, like players and teams, are tried as a pair).
  const pairs: Record<string, string[]> = { players: ["players", "teams"], teams: ["players", "teams"], scoring: ["scoring", "votesToWin"], votesToWin: ["scoring", "votesToWin"] };
  const tried = new Set<string>();
  for (const field of Object.keys(m)) {
    if (!KNOWN_FIELDS.has(field)) {
      warnings.push(`"${field}" isn't a manifest field VibeCade reads, so it's ignored`);
      continue;
    }
    if (field === "url" || field === "version" || field === "$schema" || field === "durationLabel" || field === "authority") continue;
    const group = pairs[field] ?? [field];
    const label = group.filter((f) => m[f] !== undefined).join(" + ");
    if (tried.has(label)) continue;
    tried.add(label);
    const overlay = Object.fromEntries(group.filter((f) => m[f] !== undefined).map((f) => [f, m[f]]));
    const problem = versionManifestError({ ...BASELINE, ...(overlay.teams !== undefined && overlay.players === undefined ? { players: { min: 2, max: 2 } } : {}), ...overlay });
    if (problem) errors.push(`${label}: ${problem}`);
  }
  // Then the whole thing, for any rule the single fields didn't catch.
  if (!errors.length) {
    const whole = versionManifestError(m);
    if (whole) errors.push(whole);
  }

  if (m.url === undefined) warnings.push('No "url": set it to the HTTPS address where your game is hosted before registering');
  else {
    const problem = versionUrlError(m.url);
    if (problem) errors.push(`url: ${problem}`);
    else if (typeof m.url === "string" && /(^|\.)example\.(com|org|net)$/.test(safeHost(m.url))) {
      warnings.push(`url is still the template's placeholder (${m.url}); set it to your hosted address`);
    } else if (typeof m.url === "string" && /^http:\/\//.test(m.url)) {
      warnings.push("url is a localhost address: fine for the Sandbox, but players need an https URL");
    }
  }
  if (m.version !== undefined && (typeof m.version !== "string" || !SEMVER_PATTERN.test(m.version))) {
    errors.push('version must look like "1.0.0"');
  }
  if (m.authority !== undefined && m.authority !== "client" && m.authority !== "server") {
    errors.push('authority is "client" (default) or "server"');
  } else if (m.authority === "server") {
    warnings.push('authority "server" is switched on in the app\'s Server panel on VibeCade, not by the manifest: your server must call reportResult');
  }

  if (typeof m.icon === "string" && m.icon && !isSingleEmoji(m.icon)) warnings.push(`icon should be a single emoji (got "${m.icon}")`);

  const kind = m.kind === "app" ? "app" : "game";
  const modes = Array.isArray(m.modes) ? m.modes : [];
  if (kind === "game") {
    if (!modes.includes("practice")) {
      warnings.push('modes has no "practice": signed-out people who see your game in a post on X can\'t play it (practice lets them play bots that your app drives with submitFor)');
    }
    if (m.scoring === "votes" && m.votesToWin === undefined) warnings.push("scoring is votes but votesToWin is unset (VibeCade uses 5)");
    if (m.scoring !== "votes" && m.votesToWin !== undefined) warnings.push("votesToWin only applies with scoring \"votes\"");
    if (m.turnBased === true && !modes.includes("async")) warnings.push('turnBased games usually offer "async" too, so people can play a move a day');
    if (m.setup === true) warnings.push('setup: true means your app must handle purpose "setup" and call setup.submit (test with ?vibecade-purpose=setup)');
  }
  if (!Array.isArray(m.howTo) || !m.howTo.length) warnings.push("howTo is empty: up to 3 short lines shown before a match");
  if (typeof m.description !== "string" || !m.description.trim()) warnings.push("description is empty: it's the text on your app page");

  const stats = (Array.isArray(m.stats) ? m.stats : []) as StatDef[];
  const achievements = (Array.isArray(m.achievements) ? m.achievements : []) as AchievementDef[];
  const xp = achievements.reduce((sum, a) => sum + (Number.isInteger(a?.xp) ? a.xp : 0), 0);
  const category = CATEGORIES.find((c) => c.id === m.category)?.label ?? String(m.category ?? "?");
  const players = isPlainObject(m.players) ? `${String(m.players.min)}–${String(m.players.max)} players` : "2 players";
  const summary =
    kind === "app"
      ? `Standalone app · ${category} · ${stats.length} stats · ${achievements.length} achievements (${xp}/${LIMITS.maxAchievementXpPerApp} XP)`
      : `Game · ${category} · ${players}${m.teams ? ` in ${String(m.teams)} teams` : ""} · ${modes.join("/") || "no modes"} · scoring ${String(m.scoring ?? "?")} · ${stats.length}/${LIMITS.maxStats} stats · ${achievements.length}/${LIMITS.maxAchievements} achievements (${xp}/${LIMITS.maxAchievementXpPerApp} XP)`;

  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings, summary };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export type ProgressChange =
  | { ok: true; manifest: Record<string, unknown>; defs: ProgressDefs; summary: string; warnings: string[] }
  | { ok: false; error: string };

/**
 * Applies stats/achievements to a manifest with the same rules as the console's
 * "Stats & achievements as JSON" import: keys/ids are derived from labels when
 * left out, aggregate defaults to max, icon to 🏆, XP to 0.
 */
export function applyProgress(
  manifest: Record<string, unknown>,
  change: { stats?: unknown; achievements?: unknown },
  mode: ImportMode = "merge",
): ProgressChange {
  const current: ProgressDefs = {
    stats: Array.isArray(manifest.stats) ? (manifest.stats as StatDef[]) : [],
    achievements: Array.isArray(manifest.achievements) ? (manifest.achievements as AchievementDef[]) : [],
  };
  const body: Record<string, unknown> = {};
  if (change.stats !== undefined) body.stats = change.stats;
  if (change.achievements !== undefined) body.achievements = change.achievements;
  if (!Object.keys(body).length) return { ok: false, error: "Pass stats, achievements or both" };
  const result = importProgressJson(JSON.stringify(body), current, mode);
  if (!result.ok) return result;
  const next = { ...manifest, stats: result.value.stats, achievements: result.value.achievements };
  return { ok: true, manifest: next, defs: result.value, summary: describeProgress(result.value), warnings: result.warnings };
}
