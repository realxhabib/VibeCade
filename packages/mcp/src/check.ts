/**
 * Reviews a VibeCade project folder the way the platform will see it: the
 * manifest, the SDK calls in the code (with the site's own app scanner), and
 * the hosting headers that decide whether the game shows inside X.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isScannablePath, scanSources, type ScanFinding, type ScanSource } from "@/platform/app-scan";
import type { AchievementDef, StatDef } from "@/platform/types";
import { checkManifest, MANIFEST_FILE } from "./manifest";

export interface Issue {
  level: "error" | "warning" | "info";
  message: string;
  /** `file:line` when the issue points at code. */
  at?: string;
}

export interface CheckReport {
  ok: boolean;
  issues: Issue[];
  manifest: string | null;
  files: number;
  summary: string;
}

const MAX_FILES = 400;
const MAX_BYTES = 512 * 1024;
/** Build output and dependencies: the source is what matters. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".vercel", ".turbo", ".output", "coverage"]);
const HEADER_FILES = ["vercel.json", "netlify.toml", "_headers", "public/_headers", "static/_headers", "firebase.json"];
/** Every page that frames a game on its way into a post on X. */
const REQUIRED_ANCESTORS = ["vibecade.si", "x.com", "twitter.com"];

/** Reads the project's code files (relative paths, forward slashes). */
export function readProject(dir: string): { sources: ScanSource[]; truncated: boolean } {
  const sources: ScanSource[] = [];
  let truncated = false;
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (sources.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const full = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(full);
        continue;
      }
      const path = relative(dir, full).split("\\").join("/");
      if (!entry.isFile() || !(isScannablePath(path) || path.endsWith(".css")) || statSync(full).size > MAX_BYTES) continue;
      sources.push({ path, text: readFileSync(full, "utf8") });
    }
  };
  walk(dir);
  return { sources, truncated };
}

interface Hit {
  file: string;
  line: number;
}

function find(sources: ScanSource[], pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const source of sources) {
    for (const m of source.text.matchAll(global)) {
      hits.push({ file: source.path, line: source.text.slice(0, m.index).split("\n").length });
      if (hits.length > 50) return hits;
    }
  }
  return hits;
}

const at = (hits: Hit[]) => (hits[0] ? `${hits[0].file}:${hits[0].line}` : undefined);

function findingOf<T>(findings: ScanFinding[], field: ScanFinding["field"]): T | undefined {
  return findings.find((f) => f.field === field)?.value as T | undefined;
}

/** Checks the hosting config for framing headers that would blank the game inside X. */
export function checkHeaders(dir: string): Issue[] {
  const issues: Issue[] = [];
  for (const file of HEADER_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    if (/x-frame-options/i.test(text)) {
      issues.push({ level: "error", message: `${file} sends X-Frame-Options, which stops VibeCade (and X) from framing your game. Remove it.`, at: file });
    }
    const ancestors = /frame-ancestors([^"'\n;]*)/i.exec(text);
    if (ancestors) {
      const list = ancestors[1]!;
      const missing = REQUIRED_ANCESTORS.filter((host) => !list.includes(host));
      if (missing.length && !/\*(\s|$)/.test(list)) {
        issues.push({
          level: "error",
          message: `${file}: frame-ancestors leaves out ${missing.join(", ")}. A playable post on X frames VibeCade's player card, which frames your game, so every one must be listed: frame-ancestors https://vibecade.si https://x.com https://*.x.com https://twitter.com https://*.twitter.com (or send no frame-ancestors at all).`,
          at: file,
        });
      }
    }
  }
  return issues;
}

/** The whole review. */
export function checkProject(dir: string): CheckReport {
  const issues: Issue[] = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { ok: false, issues: [{ level: "error", message: `${dir} isn't a folder` }], manifest: null, files: 0, summary: "" };
  }
  const { sources, truncated } = readProject(dir);
  if (truncated) issues.push({ level: "info", message: `Only the first ${MAX_FILES} code files were read` });

  // Manifest.
  const manifestPath = join(dir, MANIFEST_FILE);
  let manifest: Record<string, unknown> | null = null;
  if (!existsSync(manifestPath)) {
    issues.push({ level: "warning", message: `No ${MANIFEST_FILE}: create one (vibecade_validate_manifest shows what it needs) so your listing and capabilities live next to the code` });
  } else {
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest = typeof parsed === "object" && parsed && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
      const report = checkManifest(parsed);
      for (const e of report.errors) issues.push({ level: "error", message: `Manifest: ${e}`, at: MANIFEST_FILE });
      for (const w of report.warnings) issues.push({ level: "warning", message: `Manifest: ${w}`, at: MANIFEST_FILE });
    } catch (error) {
      issues.push({ level: "error", message: `${MANIFEST_FILE} isn't valid JSON: ${error instanceof Error ? error.message : String(error)}`, at: MANIFEST_FILE });
    }
  }

  const code = sources.filter((s) => !/\.(json|css)$/.test(s.path));
  // What the code does, scanned without the manifest so it can be compared with it.
  const scan = scanSources(code);
  for (const note of scan.notes) issues.push({ level: "warning", message: note });
  const kind = manifest?.kind === "app" ? "app" : "game";

  if (code.length && !scan.sdk) issues.push({ level: "error", message: "No VibeCade SDK usage found (connect(), VibeCadeProvider or the /sdk/v1.js bundle)" });

  // Lifecycle.
  const ready = find(code, /\.ready\(\s*\)/);
  const submits = find(code, /\.submit\(\s*\{/);
  const submitFor = find(code, /\.submitFor\(/);
  const roomOrState = find(code, /\.room\.(send|on|onAny|direct)\(|\buseRoomEvent\(|\.state\.(update|set)\(|\buseMatchState\(/);
  if (kind === "game") {
    if (scan.sdk && !ready.length) {
      issues.push({ level: "error", message: "ready() is never called, so players stay on the loading screen. Call it once your first screen is drawn (setup screens too)." });
    }
    if (scan.sdk && !submits.length && !/reportResult|\/result\b/.test(code.map((s) => s.text).join("\n"))) {
      issues.push({ level: "error", message: "submit({ score }) is never called, so matches never settle. Every seated player submits exactly once." });
    }
    const modes = Array.isArray(manifest?.modes) ? (manifest!.modes as string[]) : [];
    if (modes.includes("practice") && !submitFor.length) {
      issues.push({ level: "warning", message: 'modes includes "practice", but the code never calls submitFor: in practice your app plays the bots (players.filter(p => p.isBot)) and must submit for each one, or the match never ends.' });
    }
    if (scan.sdk && !find(code, /\bisSpectator\b|role\s*===?\s*["']spectator["']|usePlayers\(\)/).length && manifest?.spectators !== false) {
      issues.push({ level: "info", message: "Spectators are on (the default) but the code never checks isSpectator: hide the controls for them, since their sends are refused." });
    }
  } else {
    const matchOnly = find(code, /\.submit\(\s*\{|\.submitFor\(|\.room\.send\(|\.state\.(update|set)\(|\.turn\.end\(/);
    if (matchOnly.length) {
      issues.push({ level: "error", message: 'This is a standalone app (kind "app"), which has no match: submit, room.send, state.* and turn.end are refused with forbidden.', at: at(matchOnly) });
    }
  }

  // Reserved and risky calls.
  const reserved = find(code, /\.send\(\s*["'`]xapps\.direct["'`]/);
  if (reserved.length) issues.push({ level: "error", message: 'The room event "xapps.direct" is reserved for room.direct() signaling', at: at(reserved) });
  if (kind === "game" && roomOrState.length) {
    const random = find(code, /\bMath\.random\(/);
    if (random.length) {
      issues.push({
        level: "warning",
        message: "Math.random() differs on every screen. For anything players must agree on (decks, layouts, spawns, bot moves) use the client's match-seeded random (vibecade.random, or random.fork(label)).",
        at: at(random),
      });
    }
  }
  const htmlHeight = find(sources.filter((s) => /\.(css|html?)$/.test(s.path)), /html\s*,\s*body\s*\{[^}]*height:\s*100%/);
  if (htmlHeight.length && find(code, /autoResize\(|useAutoResize\(/).length) {
    issues.push({ level: "warning", message: "html/body are pinned to height: 100%, so ui.autoResize() always measures the frame instead of your content", at: at(htmlHeight) });
  }

  // Stats & achievements used in code vs declared.
  if (manifest) {
    const declaredStats = new Set(((Array.isArray(manifest.stats) ? manifest.stats : []) as StatDef[]).map((s) => s?.key));
    const declaredAchievements = new Set(((Array.isArray(manifest.achievements) ? manifest.achievements : []) as AchievementDef[]).map((a) => a?.id));
    const usedStats = (findingOf<StatDef[]>(scan.findings, "stats") ?? []).map((s) => s.key);
    const usedAchievements = (findingOf<AchievementDef[]>(scan.findings, "achievements") ?? []).map((a) => a.id);
    const undeclaredStats = usedStats.filter((k) => !declaredStats.has(k));
    const undeclaredAchievements = usedAchievements.filter((id) => !declaredAchievements.has(id));
    if (undeclaredStats.length) {
      issues.push({ level: "error", message: `Stats reported in code but not declared in the manifest (the host refuses them): ${undeclaredStats.join(", ")}. Add them with vibecade_set_progress.` });
    }
    if (undeclaredAchievements.length) {
      issues.push({ level: "error", message: `Achievements unlocked in code but not declared in the manifest (the host refuses them): ${undeclaredAchievements.join(", ")}. Add them with vibecade_set_progress.` });
    }
    const unusedStats = [...declaredStats].filter((k) => k && !usedStats.includes(k));
    const unusedAchievements = [...declaredAchievements].filter((id) => id && !usedAchievements.includes(id));
    if (unusedStats.length) issues.push({ level: "info", message: `Declared stats never reported in code: ${unusedStats.join(", ")}` });
    if (unusedAchievements.length) issues.push({ level: "info", message: `Declared achievements never unlocked in code (fine if ids are built at runtime or unlocked by your server): ${unusedAchievements.join(", ")}` });

    // Capabilities the code relies on but the manifest doesn't switch on.
    for (const [field, label] of [
      ["turnBased", "passes turns (turn.end / useTurn)"],
      ["setup", "renders a challenge setup screen"],
    ] as const) {
      if (findingOf<boolean>(scan.findings, field) && manifest[field] !== true) {
        issues.push({ level: "warning", message: `The code ${label} but the manifest's ${field} isn't true` });
      }
    }
    const codeKind = findingOf<string>(scan.findings, "kind");
    if (codeKind && codeKind !== kind) {
      issues.push({ level: "warning", message: `The code looks like ${codeKind === "app" ? "a standalone app (no match)" : "a game (it plays matches)"}, but the manifest says kind "${kind}"` });
    }
  }

  issues.push(...checkHeaders(dir));

  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.level]++;
  const summary = `${sources.length} files · ${counts.error} errors · ${counts.warning} warnings · ${counts.info} notes`;
  return { ok: counts.error === 0, issues, manifest: manifest ? MANIFEST_FILE : null, files: sources.length, summary };
}
