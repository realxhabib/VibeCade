import { LIMITS } from "vibecade-sdk";
import { achievementDefsError, DEF_ID_PATTERN, DEF_LABEL_MAX, isSingleEmoji, statDefsError } from "./catalog";
import { CATEGORIES, type AchievementDef, type AppCategory, type AppKind, type PlayableMode, type Scoring, type StatDef } from "./types";

/**
 * Reads an app's code (its project folder, or the HTML and scripts its URL
 * serves) and proposes the listing fields a developer would otherwise type by
 * hand: stats and achievements from `stats.report` / `achievements.unlock`
 * calls, capabilities from the SDK features it uses, and the name and
 * description from the page's meta tags. A `vibecade.manifest.json` in the
 * sources wins over anything guessed from code.
 *
 * Pure: the URL route (`/api/scan-app`) and the folder picker both feed it text.
 */

export interface ScanSource {
  /** A relative path or a URL; shown as evidence. */
  path: string;
  text: string;
}

/** The form fields a scan can propose. */
export interface ScannedFields {
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
  kind: AppKind;
  icon: string;
  accent: [string, string];
  modes: PlayableMode[];
  scoring: Scoring;
  howTo: string[];
  players: { min: number; max: number };
  teams: 0 | 2 | 3 | 4;
  spectators: boolean;
  turnBased: boolean;
  setup: boolean;
  stats: StatDef[];
  achievements: AchievementDef[];
}

export type ScanField = keyof ScannedFields;

/** `manifest`: stated in vibecade.manifest.json. `code`: read from SDK calls or meta tags. `guess`: inferred from names. */
export type ScanConfidence = "manifest" | "code" | "guess";

export interface ScanEvidence {
  file: string;
  line: number;
  snippet: string;
}

export interface ScanFinding<K extends ScanField = ScanField> {
  field: K;
  value: ScannedFields[K];
  confidence: ScanConfidence;
  /** Why the scan proposes this, in a few words. */
  why: string;
  evidence: ScanEvidence[];
}

export interface ScanReport {
  findings: ScanFinding[];
  /** Things the scan noticed but can't turn into a value. */
  notes: string[];
  /** Files (or URLs) that were read. */
  scanned: string[];
  /** True when the code talks to the VibeCade SDK at all. */
  sdk: boolean;
  /** The manifest file used, if any. */
  manifest: string | null;
}

export const SCAN_FIELD_LABEL: Record<ScanField, string> = {
  name: "Name",
  tagline: "Tagline",
  description: "Description",
  category: "Category",
  kind: "Kind",
  icon: "Icon",
  accent: "Accent",
  modes: "Modes",
  scoring: "Who wins",
  howTo: "How to play",
  players: "Players",
  teams: "Teams",
  spectators: "Spectators",
  turnBased: "Turn-based",
  setup: "Custom setup",
  stats: "Stats",
  achievements: "Achievements",
};

/** Field order in the report (and the form). */
const FIELD_ORDER: ScanField[] = [
  "name",
  "tagline",
  "description",
  "kind",
  "category",
  "icon",
  "accent",
  "modes",
  "scoring",
  "players",
  "teams",
  "spectators",
  "turnBased",
  "setup",
  "stats",
  "achievements",
  "howTo",
];

const MANIFEST_NAMES = /(^|\/)(vibecade|xapps)\.manifest\.json$/i;
const CODE_FILE = /\.(m?[jt]sx?|cjs|html?|vue|svelte|astro)$/i;
/** Never scanned: dependencies and the platform's own SDK bundle (it mentions every feature). */
const SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|\.vercel|\.turbo|coverage)(\/|$)|(^|\/)sdk\/(v\d+|xapps|vibecade)[^/]*\.js$/i;

export function isScannablePath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  if (SKIP_PATH.test(p)) return false;
  return MANIFEST_NAMES.test(p) || CODE_FILE.test(p.split("?")[0]!);
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** "best_time" / "bestTime" → "Best time". */
export function humanize(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
  const text = words.charAt(0).toUpperCase() + words.slice(1);
  return text.slice(0, DEF_LABEL_MAX);
}

function evidenceAt(source: ScanSource, index: number, length: number): ScanEvidence {
  const before = source.text.slice(0, index);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  let lineEnd = source.text.indexOf("\n", index);
  if (lineEnd < 0) lineEnd = source.text.length;
  let snippet = source.text.slice(lineStart, lineEnd).trim();
  // Minified bundles are one long line: show the match with a little context.
  if (snippet.length > 120) {
    const from = Math.max(0, index - 30);
    snippet = `…${source.text.slice(from, Math.min(source.text.length, index + length + 50)).replace(/\s+/g, " ")}…`;
  }
  return { file: source.path, line, snippet: snippet.slice(0, 160) };
}

/** Every match of `pattern` (global) in every source, with its evidence. */
function findAll(sources: ScanSource[], pattern: RegExp): { match: RegExpExecArray; source: ScanSource; evidence: ScanEvidence }[] {
  const out: { match: RegExpExecArray; source: ScanSource; evidence: ScanEvidence }[] = [];
  for (const source of sources) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source.text))) {
      out.push({ match: m, source, evidence: evidenceAt(source, m.index, m[0].length) });
      if (m[0].length === 0) re.lastIndex++;
      if (out.length > 500) return out;
    }
  }
  return out;
}

/** The keys of an object literal's body: `wins: 1, best, "streak": s` → wins, best, streak. */
export function objectLiteralKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let part = "";
  const flush = () => {
    const text = part.trim();
    part = "";
    if (!text || text.startsWith("...")) return;
    const colon = text.match(/^(["'`]?)([A-Za-z_$][\w$]*)\1\s*:/);
    if (colon) keys.push(colon[2]!);
    else if (/^[A-Za-z_$][\w$]*$/.test(text)) keys.push(text);
  };
  for (const ch of body) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) flush();
    else part += ch;
  }
  flush();
  return keys;
}

/** Reads the balanced `{…}` body starting at `open` (the index of `{`). */
function braceBody(text: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < text.length && i < open + 2000; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** A best guess at how a stat should aggregate, from its key. */
export function guessStat(key: string): StatDef {
  const k = key.toLowerCase();
  const timed = /(time|_ms$|ms_|duration|seconds|secs|elapsed)/.test(k);
  let aggregate: StatDef["aggregate"] = "max";
  if (/(fastest|quickest|lowest|fewest|least|shortest|^min_|_min$)/.test(k) || (timed && /(best|top|record|pb)/.test(k))) aggregate = "min";
  else if (/(^total|_total$|count|played|^games|^wins|_wins$|^losses|^plays|^matches|^kills|^taps|^moves$|^points$|^coins$|^xp$)/.test(k)) aggregate = "sum";
  else if (/(^last|^current|^latest|_last$)/.test(k)) aggregate = "last";
  const stat: StatDef = { key, label: humanize(key), aggregate };
  if (/(percent|pct|accuracy|_rate$|ratio)/.test(k)) stat.format = "percent";
  else if (timed) stat.format = "ms";
  return stat;
}

const ACHIEVEMENT_ICONS: [RegExp, string][] = [
  [/first/, "🥇"],
  [/streak|fire|hot/, "🔥"],
  [/speed|fast|quick|rush|blitz/, "⚡"],
  [/perfect|flawless|100/, "💯"],
  [/comeback|clutch/, "🦾"],
  [/secret|hidden|easter/, "🤫"],
  [/level|stage|world/, "🗺️"],
  [/team|squad|friend/, "🤝"],
  [/win|victory|champ|master|legend/, "🏆"],
  [/play|game|match/, "🎮"],
];

export function guessAchievement(id: string, xp: number): AchievementDef {
  const k = id.toLowerCase();
  const icon = ACHIEVEMENT_ICONS.find(([re]) => re.test(k))?.[1] ?? "🏅";
  return { id, name: humanize(id), description: "", icon, xp };
}

/** XP per achievement so the set stays within the per-app budget. */
function xpEach(count: number): number {
  if (!count) return 0;
  return Math.max(0, Math.min(25, Math.floor(LIMITS.maxAchievementXpPerApp / count / 5) * 5));
}

/* ---------------------------------------------------------------------- */
/* Manifest file                                                           */
/* ---------------------------------------------------------------------- */

function fromManifest(source: ScanSource, notes: string[]): ScanFinding[] {
  let data: unknown;
  try {
    data = JSON.parse(source.text);
  } catch {
    notes.push(`${source.path} isn't valid JSON, so it was skipped`);
    return [];
  }
  if (isPlainObject(data) && isPlainObject(data.manifest)) data = data.manifest;
  if (!isPlainObject(data)) return [];
  const m = data;
  const evidence = [{ file: source.path, line: 1, snippet: "vibecade.manifest.json" }];
  const out: ScanFinding[] = [];
  const add = <K extends ScanField>(field: K, value: ScannedFields[K]) =>
    out.push({ field, value, confidence: "manifest", why: "From your manifest file", evidence } as ScanFinding);
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && !v.includes("{{") ? v.trim().slice(0, max) : null);

  const name = str(m.name, 40);
  if (name) add("name", name);
  const tagline = str(m.tagline, 90);
  if (tagline) add("tagline", tagline);
  const description = str(m.description, 1200);
  if (description) add("description", description);
  if (CATEGORIES.some((c) => c.id === m.category)) add("category", m.category as AppCategory);
  if (m.kind === "game" || m.kind === "app") add("kind", m.kind);
  if (isSingleEmoji(m.icon)) add("icon", m.icon as string);
  if (Array.isArray(m.accent) && m.accent.length === 2 && m.accent.every((c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c))) {
    add("accent", [m.accent[0] as string, m.accent[1] as string]);
  }
  if (Array.isArray(m.modes)) {
    const modes = m.modes.filter((x): x is PlayableMode => x === "live" || x === "async" || x === "practice");
    if (modes.length) add("modes", [...new Set(modes)]);
  }
  if (m.scoring === "high" || m.scoring === "low" || m.scoring === "votes") add("scoring", m.scoring);
  if (Array.isArray(m.howTo)) {
    const steps = m.howTo.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().slice(0, 120)).slice(0, 3);
    if (steps.length) add("howTo", steps);
  }
  if (isPlainObject(m.players)) {
    const min = Number(m.players.min);
    const max = Number(m.players.max);
    if (Number.isInteger(min) && Number.isInteger(max) && min >= 2 && max <= 8 && min <= max) add("players", { min, max });
    else notes.push(`The manifest's players (${JSON.stringify(m.players)}) aren't a range within 2–8`);
  }
  if (m.teams === 0 || m.teams === 2 || m.teams === 3 || m.teams === 4) add("teams", m.teams);
  for (const key of ["spectators", "turnBased", "setup"] as const) if (typeof m[key] === "boolean") add(key, m[key] as boolean);
  if (Array.isArray(m.stats) && m.stats.length) {
    const error = statDefsError(m.stats);
    if (error) notes.push(`Manifest stats skipped: ${error}`);
    else add("stats", (m.stats as StatDef[]).map((s) => ({ key: s.key, label: s.label, aggregate: s.aggregate, ...(s.format ? { format: s.format } : {}) })));
  }
  if (Array.isArray(m.achievements) && m.achievements.length) {
    const list = (m.achievements as Record<string, unknown>[]).map((a) => ({ description: "", ...a }));
    const error = achievementDefsError(list);
    if (error) notes.push(`Manifest achievements skipped: ${error}`);
    else
      add(
        "achievements",
        (list as unknown as AchievementDef[]).map((a) => ({ id: a.id, name: a.name, description: a.description ?? "", icon: a.icon, xp: a.xp, ...(a.secret ? { secret: true } : {}) })),
      );
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* HTML meta                                                               */
/* ---------------------------------------------------------------------- */

const decodeEntities = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

function metaContent(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== name) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    const value = content?.[1] ?? content?.[2];
    if (value?.trim()) return decodeEntities(value.trim());
  }
  return null;
}

/** "Tap Race · VibeCade" / "Tap Race - Play now" → "Tap Race". */
function cleanTitle(title: string): string {
  return title.split(/\s+[|·•–—-]\s+/)[0]!.trim();
}

const PLACEHOLDER_TITLES = /^(vite( \+ (react|ts|vue|svelte))*|react app|document|untitled|index|home|my app|app)$/i;

function fromHtml(source: ScanSource): ScanFinding[] {
  const html = source.text;
  if (!/<html\b|<head\b|<title\b/i.test(html)) return [];
  const out: ScanFinding[] = [];
  const find = (re: RegExp) => {
    const m = re.exec(html);
    return m ? evidenceAt(source, m.index, m[0].length) : { file: source.path, line: 1, snippet: "" };
  };

  const rawTitle = metaContent(html, "og:title") ?? metaContent(html, "application-name") ?? metaContent(html, "apple-mobile-web-app-title") ?? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");
  const title = rawTitle ? cleanTitle(rawTitle) : "";
  if (title.length >= 2 && title.length <= 40 && !PLACEHOLDER_TITLES.test(title) && !title.includes("{{")) {
    out.push({ field: "name", value: title, confidence: "code", why: "The page title", evidence: [find(/<title|og:title|application-name/i)] });
  }

  const description = metaContent(html, "description") ?? metaContent(html, "og:description");
  if (description && description.length >= 8) {
    const evidence = [find(/name=["']description|og:description/i)];
    if (description.length <= 90) out.push({ field: "tagline", value: description, confidence: "code", why: "The page's meta description", evidence });
    out.push({ field: "description", value: description.slice(0, 1200), confidence: "code", why: "The page's meta description", evidence });
  }

  // The common emoji favicon: <link rel="icon" href="data:image/svg+xml,<svg …><text …>🎯</text></svg>">
  // Quoted attributes may hold ">" (the inline SVG), so tags are matched attribute by attribute.
  const links = html.match(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];
  const iconLink = links.find((tag) => /\brel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag));
  if (iconLink) {
    const href = iconLink.match(/\bhref\s*=\s*"([^"]*)"|\bhref\s*=\s*'([^']*)'/i);
    let text = href?.[1] ?? href?.[2] ?? "";
    try {
      text = decodeURIComponent(text);
    } catch {
      /* keep it as is */
    }
    const emoji = text.match(/<text[^>]*>\s*([^<\s]+)\s*<\/text>/i)?.[1];
    if (emoji && isSingleEmoji(emoji)) out.push({ field: "icon", value: emoji, confidence: "code", why: "Your emoji favicon", evidence: [find(/rel\s*=\s*["'][^"']*icon/i)] });
  }
  return out;
}

/**
 * Calls through a destructured hook result: `const { report } = useStats(); report({ … })`, or
 * minified, `const{report:r}=x();r({…})`. Only looks a little way past the destructuring, since
 * minified aliases are one letter and reused everywhere.
 */
function aliasCalls(sources: ScanSource[], name: string, args: RegExp): ReturnType<typeof findAll> {
  const out: ReturnType<typeof findAll> = [];
  const destructure = new RegExp(`\\{([^{}]*\\b${name}\\b[^{}]*)\\}\\s*=`, "g");
  for (const source of sources) {
    let d: RegExpExecArray | null;
    while ((d = destructure.exec(source.text))) {
      const entry = d[1]!.split(",").map((p) => p.trim()).find((p) => p === name || p.startsWith(`${name}:`));
      const alias = entry?.includes(":") ? entry.split(":")[1]!.trim() : entry;
      if (!alias || !/^[A-Za-z_$][\w$]*$/.test(alias)) continue;
      const windowText = source.text.slice(d.index, d.index + 6000);
      const call = new RegExp(`(?<![\\w$.])${alias.replace(/\$/g, "\\$")}${args.source}`, "g");
      let m: RegExpExecArray | null;
      while ((m = call.exec(windowText))) {
        const at = d.index + m.index;
        const match = Object.assign([...m], { index: at, input: source.text }) as unknown as RegExpExecArray;
        out.push({ match, source, evidence: evidenceAt(source, at, m[0].length) });
        if (out.length > 200) return out;
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* SDK calls                                                               */
/* ---------------------------------------------------------------------- */

const SDK_MARKERS = /vibecade-sdk|@xapps\/sdk|\/sdk\/v1\.js|\bVibeCade\.connect\b|\bXApps\.connect\b|\buseVibeCade\b|\buseXApps\b|\bVibeCadeProvider\b|\bXAppsProvider\b|\bxapps\s*:\s*1\b/;

interface CodeScan {
  findings: ScanFinding[];
  notes: string[];
  sdk: boolean;
}

function fromCode(sources: ScanSource[]): CodeScan {
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  const sdk = sources.some((s) => SDK_MARKERS.test(s.text));
  const first = (pattern: RegExp) => findAll(sources, pattern).slice(0, 3).map((h) => h.evidence);

  /* Stats: stats.report({ … }) (and `report({ … })` from useStats), stats.leaderboard("key"). */
  const statKeys = new Map<string, ScanEvidence[]>();
  const invalidKeys = new Set<string>();
  const addStat = (key: string, evidence: ScanEvidence) => {
    if (!DEF_ID_PATTERN.test(key)) {
      invalidKeys.add(key);
      return;
    }
    const list = statKeys.get(key) ?? [];
    if (list.length < 3) list.push(evidence);
    statKeys.set(key, list);
  };
  const reportCalls = [
    ...findAll(sources, /\bstats\.report\(\s*\{/),
    ...aliasCalls(sources, "report", /\(\s*\{/),
    // Server API: POST /api/v1/stats { userId, values: { … } }
    ...findAll(sources.filter((s) => /\/api\/v1\/stats\b/.test(s.text)), /\bvalues\s*:\s*\{/),
  ];
  for (const { match, source, evidence } of reportCalls) {
    const open = match.index + match[0].length - 1;
    const body = braceBody(source.text, open);
    if (body === null) continue;
    for (const key of objectLiteralKeys(body)) addStat(key, evidence);
  }
  for (const { match, evidence } of findAll(sources, /\.stats\.leaderboard\(\s*["'`]([A-Za-z_][\w]*)["'`]/)) addStat(match[1]!, evidence);
  for (const { match, evidence } of findAll(sources.filter((s) => /\buseStatStanding\b/.test(s.text)), /\buseStatStanding\(\s*["'`]([A-Za-z_][\w]*)["'`]/)) addStat(match[1]!, evidence);
  if (invalidKeys.size) {
    notes.push(
      `Stat keys must be lowercase a–z, 0–9 or _ (max 32), so ${[...invalidKeys].slice(0, 5).map((k) => `"${k}"`).join(", ")} can't be declared as is. Rename them in your code (e.g. ${[...invalidKeys][0]!.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}).`,
    );
  }
  if (statKeys.size) {
    let stats = [...statKeys.keys()].map(guessStat);
    if (stats.length > LIMITS.maxStats) {
      notes.push(`Found ${stats.length} stats; only the first ${LIMITS.maxStats} fit`);
      stats = stats.slice(0, LIMITS.maxStats);
    }
    findings.push({
      field: "stats",
      value: stats,
      confidence: "code",
      why: `Reported with stats.report (labels and aggregates are guesses from the keys)`,
      evidence: [...statKeys.values()].flat().slice(0, 6),
    });
  }

  /* Achievements: achievements.unlock("id") (and `unlock("id")` from useAchievements). */
  const ids = new Map<string, ScanEvidence[]>();
  const badIds = new Set<string>();
  const unlockCalls = [
    ...findAll(sources, /\bachievements\.unlock\(\s*(["'`])([^"'`$]+)\1/),
    ...aliasCalls(sources, "unlock", /\(\s*(["'`])([^"'`$]+)\1/),
  ];
  for (const { match, evidence } of unlockCalls) {
    const id = match[2]!;
    if (!DEF_ID_PATTERN.test(id)) {
      badIds.add(id);
      continue;
    }
    const list = ids.get(id) ?? [];
    if (list.length < 3) list.push(evidence);
    ids.set(id, list);
  }
  // Server API: POST /api/v1/achievements { userId, id: "…" }
  for (const source of sources.filter((s) => /\/api\/v1\/achievements\b/.test(s.text))) {
    for (const { match, evidence } of findAll([source], /\bid\s*:\s*(["'`])([a-z][a-z0-9_]{0,31})\1/)) {
      const list = ids.get(match[2]!) ?? [];
      if (list.length < 3) list.push(evidence);
      ids.set(match[2]!, list);
    }
  }
  const dynamic = findAll(sources, /\bachievements\.unlock\(\s*`[^`]*\$\{/);
  if (dynamic.length) notes.push(`Some achievement ids are built at runtime (${dynamic[0]!.evidence.snippet.slice(0, 60)}), so add those by hand`);
  if (badIds.size) notes.push(`Achievement ids must be lowercase a–z, 0–9 or _ (max 32): ${[...badIds].slice(0, 5).map((k) => `"${k}"`).join(", ")}`);
  if (ids.size) {
    let list = [...ids.keys()];
    if (list.length > LIMITS.maxAchievements) {
      notes.push(`Found ${list.length} achievements; only the first ${LIMITS.maxAchievements} fit`);
      list = list.slice(0, LIMITS.maxAchievements);
    }
    const xp = xpEach(list.length);
    findings.push({
      field: "achievements",
      value: list.map((id) => guessAchievement(id, xp)),
      confidence: "code",
      why: `Unlocked with achievements.unlock (names, icons and ${xp} XP each are placeholders)`,
      evidence: [...ids.values()].flat().slice(0, 6),
    });
  }

  /* Capabilities. */
  const turn = first(/\.turn\.end\(|\buseTurn\(\)/);
  if (turn.length) findings.push({ field: "turnBased", value: true, confidence: "code", why: "Passes turns (turn.end / useTurn)", evidence: turn });

  const setup = first(/\.setup\.submit\(|\buseSetup\(\)|purpose\s*===?\s*["']setup["']|\bisSetup\b/);
  if (setup.length) findings.push({ field: "setup", value: true, confidence: "code", why: "Renders a challenge setup screen (setup.submit)", evidence: setup });

  const spectate = first(/\bisSpectator\b|role\s*===?\s*["']spectator["']/);
  if (spectate.length) findings.push({ field: "spectators", value: true, confidence: "code", why: "Handles spectators", evidence: spectate });

  const teams = first(/\.teammates\b|\bmatch\.teams\b|\.winnerTeam\b/);
  if (teams.length) notes.push(`Your code uses teams (${teams[0]!.snippet.slice(0, 60)}); set the team count by hand`);

  const live = first(/\.room\.(send|on|onAny)\(|\buseRoomEvent\(|\.state\.(update|set)\(|\buseMatchState\(|\.room\.direct\(/);
  const practice = first(/\.submitFor\(|\.isBot\(|\.isBot\b/);
  const asyncMode = first(/mode\s*===?\s*["']async["']|\bturnDeadline\b/);
  const standalone = first(/purpose\s*===?\s*["']app["']|\buseStandalone\(\)/);
  const submits = findAll(sources, /\.submit\(\s*\{|\.submitFor\([^,]+,\s*\{/);
  const matchy = submits.length > 0 || live.length > 0 || turn.length > 0;

  if (standalone.length && !matchy) {
    findings.push({ field: "kind", value: "app", confidence: "code", why: "Runs standalone and never submits a match result", evidence: standalone });
  } else if (matchy) {
    findings.push({ field: "kind", value: "game", confidence: "code", why: "Plays matches (submits results or uses the room)", evidence: (submits.length ? submits.slice(0, 2).map((h) => h.evidence) : live).slice(0, 3) });
  }

  if (matchy) {
    const modes: PlayableMode[] = [];
    const evidence: ScanEvidence[] = [];
    if (live.length) {
      modes.push("live");
      evidence.push(live[0]!);
    }
    // Turn-based games can be played a move at a time, so they usually offer "play anytime".
    if (asyncMode.length || turn.length) {
      modes.push("async");
      evidence.push((asyncMode[0] ?? turn[0])!);
    }
    if (practice.length) {
      modes.push("practice");
      evidence.push(practice[0]!);
    }
    if (modes.length) {
      findings.push({
        field: "modes",
        value: modes,
        confidence: "code",
        why: [live.length && "room or shared state → live", modes.includes("async") && "turns or async checks → play anytime", practice.length && "drives bots → practice"].filter(Boolean).join(", "),
        evidence,
      });
    }
  }

  /* Scoring: a display with no score anywhere → the crowd votes; a time-like score → lowest wins. */
  if (submits.length) {
    const bodies = submits.map((h) => ({ body: braceBody(h.source.text, h.match.index + h.match[0].length - 1) ?? "", evidence: h.evidence }));
    const scored = bodies.filter((b) => objectLiteralKeys(b.body).includes("score"));
    if (!scored.length && bodies.some((b) => objectLiteralKeys(b.body).includes("display"))) {
      findings.push({ field: "scoring", value: "votes", confidence: "guess", why: "Submits entries without a score, so the crowd judges", evidence: bodies.slice(0, 2).map((b) => b.evidence) });
    } else {
      const timed = scored.filter((b) => /score\s*:\s*[^,}]*(ms|time|elapsed|duration|moves|strokes|seconds)/i.test(b.body));
      if (timed.length && timed.length === scored.length) {
        findings.push({ field: "scoring", value: "low", confidence: "guess", why: "The score looks like a time or a move count", evidence: timed.slice(0, 2).map((b) => b.evidence) });
      } else if (scored.length) {
        findings.push({ field: "scoring", value: "high", confidence: "guess", why: "Submits a score", evidence: scored.slice(0, 2).map((b) => b.evidence) });
      }
    }
  }

  /* Players: explicit comparisons against minPlayers/maxPlayers or the table size. */
  const counts = findAll(sources, /\b(?:players|opponents)\.length\s*(===?|<=|>=|<|>)\s*([2-8])\b/);
  if (counts.length) {
    const sizes = counts.map((h) => {
      const n = Number(h.match[2]);
      const op = h.match[1]!;
      return op === "<" ? n - 1 : op === ">" ? n + 1 : n;
    });
    const isOpponents = counts.every((h) => h.match[0].startsWith("opponents"));
    const adjusted = sizes.map((n) => (isOpponents ? n + 1 : n)).filter((n) => n >= 2 && n <= 8);
    if (adjusted.length) {
      const min = Math.min(...adjusted);
      const max = Math.max(...adjusted);
      findings.push({ field: "players", value: { min, max }, confidence: "guess", why: "Your code checks the table size", evidence: counts.slice(0, 3).map((h) => h.evidence) });
    }
  }

  return { findings, notes, sdk };
}

/* ---------------------------------------------------------------------- */
/* Entry point                                                             */
/* ---------------------------------------------------------------------- */

const RANK: Record<ScanConfidence, number> = { manifest: 3, code: 2, guess: 1 };

/** Scans the given files. Manifest values beat code, code beats guesses; stats and achievements are unioned. */
export function scanSources(input: ScanSource[]): ScanReport {
  const sources = input.filter((s) => isScannablePath(s.path) || /^https?:/.test(s.path));
  const notes: string[] = [];
  const manifestSource = sources.find((s) => MANIFEST_NAMES.test(s.path.split("?")[0]!));
  const fromFile = manifestSource ? fromManifest(manifestSource, notes) : [];
  const code = sources.filter((s) => s !== manifestSource && !s.path.toLowerCase().endsWith(".json"));
  const html = code.flatMap(fromHtml);
  const scanned = fromCode(code);
  notes.push(...scanned.notes);

  const byField = new Map<ScanField, ScanFinding>();
  for (const finding of [...fromFile, ...html, ...scanned.findings]) {
    const current = byField.get(finding.field);
    if (!current) {
      byField.set(finding.field, finding);
      continue;
    }
    if (finding.field === "stats" || finding.field === "achievements") {
      byField.set(finding.field, unionDefs(current, finding));
      continue;
    }
    if (RANK[finding.confidence] > RANK[current.confidence]) byField.set(finding.field, finding);
  }

  const findings = FIELD_ORDER.map((f) => byField.get(f)).filter((f): f is ScanFinding => !!f);
  if (!scanned.sdk && !manifestSource && code.length) notes.push("No VibeCade SDK calls found. Is this the right app?");
  return { findings, notes, scanned: input.map((s) => s.path), sdk: scanned.sdk, manifest: manifestSource?.path ?? null };
}

/** Manifest definitions first; code adds the keys/ids the manifest doesn't declare yet. */
function unionDefs(a: ScanFinding, b: ScanFinding): ScanFinding {
  const [base, extra] = RANK[a.confidence] >= RANK[b.confidence] ? [a, b] : [b, a];
  if (base.field === "stats") {
    const have = new Set((base.value as StatDef[]).map((s) => s.key));
    const added = (extra.value as StatDef[]).filter((s) => !have.has(s.key));
    if (!added.length) return base;
    const value = [...(base.value as StatDef[]), ...added].slice(0, LIMITS.maxStats);
    return { ...base, value, why: `${base.why}, plus ${added.length} more reported in your code`, evidence: [...base.evidence, ...extra.evidence].slice(0, 6) };
  }
  const have = new Set((base.value as AchievementDef[]).map((x) => x.id));
  const added = (extra.value as AchievementDef[]).filter((x) => !have.has(x.id));
  if (!added.length) return base;
  const used = (base.value as AchievementDef[]).reduce((sum, x) => sum + x.xp, 0);
  const room = Math.max(0, LIMITS.maxAchievements - (base.value as AchievementDef[]).length);
  const fit = added.slice(0, room);
  const each = fit.length ? Math.min(25, Math.floor(Math.max(0, LIMITS.maxAchievementXpPerApp - used) / fit.length / 5) * 5) : 0;
  const value = [...(base.value as AchievementDef[]), ...fit.map((x) => ({ ...x, xp: each }))];
  return { ...base, value, why: `${base.why}, plus ${fit.length} more unlocked in your code`, evidence: [...base.evidence, ...extra.evidence].slice(0, 6) };
}

/* ---------------------------------------------------------------------- */
/* Applying                                                                */
/* ---------------------------------------------------------------------- */

/**
 * The form patch for the chosen findings. Stats and achievements are added to
 * the rows already there (rows the developer typed keep their wording), within
 * the limits; everything else replaces the field.
 */
export function scanPatch<S extends { stats: StatDef[]; achievements: AchievementDef[] }>(
  current: S,
  findings: ScanFinding[],
): { patch: Partial<ScannedFields>; skipped: string[] } {
  const patch: Partial<ScannedFields> = {};
  const skipped: string[] = [];
  for (const f of findings) {
    if (f.field === "stats") {
      const have = new Set(current.stats.map((s) => s.key));
      const next = [...current.stats, ...(f.value as StatDef[]).filter((s) => !have.has(s.key))];
      if (next.length > LIMITS.maxStats) skipped.push(`${next.length - LIMITS.maxStats} stats (up to ${LIMITS.maxStats})`);
      patch.stats = next.slice(0, LIMITS.maxStats);
    } else if (f.field === "achievements") {
      const have = new Set(current.achievements.map((a) => a.id));
      const next = [...current.achievements];
      let xp = next.reduce((sum, a) => sum + a.xp, 0);
      let dropped = 0;
      for (const a of f.value as AchievementDef[]) {
        if (have.has(a.id)) continue;
        if (next.length >= LIMITS.maxAchievements) {
          dropped++;
          continue;
        }
        const award = Math.max(0, Math.min(a.xp, LIMITS.maxAchievementXpPerApp - xp));
        xp += award;
        next.push({ ...a, xp: award });
      }
      if (dropped) skipped.push(`${dropped} achievements (up to ${LIMITS.maxAchievements})`);
      patch.achievements = next;
    } else {
      (patch as Record<string, unknown>)[f.field] = f.value;
    }
  }
  // Seats must split evenly into teams.
  const teams = patch.teams;
  if (teams && patch.players && patch.players.max % teams !== 0) {
    delete patch.teams;
    skipped.push("the team count (max players isn't a multiple of it)");
  }
  return { patch, skipped };
}

/** "3 stats", "Turn-based: on", "Live, Practice"… for the report rows. */
export function describeFinding(f: ScanFinding): string {
  switch (f.field) {
    case "stats":
      return (f.value as StatDef[]).map((s) => s.key).join(", ");
    case "achievements":
      return (f.value as AchievementDef[]).map((a) => `${a.icon} ${a.id}`).join(", ");
    case "players": {
      const p = f.value as ScannedFields["players"];
      return p.min === p.max ? `${p.min} players` : `${p.min}–${p.max} players`;
    }
    case "teams":
      return f.value ? `${f.value} teams` : "Free for all";
    case "spectators":
    case "turnBased":
    case "setup":
      return f.value ? "On" : "Off";
    case "modes":
      return (f.value as PlayableMode[]).map((m) => ({ live: "Live", async: "Play anytime", practice: "Practice" })[m]).join(", ");
    case "scoring":
      return ({ high: "Highest score", low: "Lowest score", votes: "The crowd" } as const)[f.value as Scoring];
    case "accent":
      return (f.value as [string, string]).join(" → ");
    case "howTo":
      return (f.value as string[]).join(" / ");
    case "category":
      return CATEGORIES.find((c) => c.id === f.value)?.label ?? String(f.value);
    case "kind":
      return f.value === "app" ? "App" : "Game";
    default:
      return String(f.value);
  }
}
