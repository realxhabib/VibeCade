/**
 * The VibeCade developer docs, split into sections an agent can search and
 * read one at a time instead of loading a 700-line README into its context.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DocFile {
  /** Short id used by the tools: `sdk`, `guide`, `templates`, `skill`… */
  id: string;
  title: string;
  description: string;
  /** File name inside the docs folder. */
  file: string;
}

/** What ships in the package's `docs/` folder (copied there by build.mjs). */
export const DOC_FILES: readonly DocFile[] = [
  { id: "guide", title: "Build your first game", description: "Empty folder → playable post on X: scaffold, mock host, hosting and framing headers, Sandbox, register, review, share, updates, troubleshooting", file: "build-a-game.md" },
  { id: "sdk", title: "vibecade-sdk reference", description: "The whole SDK: lifecycle, API table, standalone apps, 2–8 players, teams, turns, shared state, setup screens, spectators, WebRTC, media, storage, stats, achievements, logs, server authority and webhooks", file: "sdk.md" },
  { id: "templates", title: "create-vibecade starters", description: "The react, turn-based and vanilla starters and the scaffolder's options", file: "create-vibecade.md" },
  { id: "skill", title: "Building a VibeCade game with an agent", description: "The workflow and rules for building a VibeCade game end to end (the same text as the Claude skill)", file: "skill.md" },
  { id: "api", title: "API on one page", description: "Every client member, the room, shared state, turns, setup, host UI, data APIs and React hooks in compact tables", file: "api.md" },
  { id: "patterns", title: "Game patterns", description: "Copy-ready code for realtime duels, turn-based state, N-player tables, teams, practice bots, setup screens, standalone apps and crowd judging", file: "patterns.md" },
  { id: "manifest", title: "Manifest reference", description: "Every vibecade.manifest.json field with its limits, plus stats and achievements", file: "manifest.md" },
];

export interface Section {
  doc: string;
  /** `sdk#stats--leaderboards`-style id, stable across builds. */
  id: string;
  heading: string;
  level: number;
  /** Headings above this one, outermost first. */
  path: string[];
  text: string;
}

/** GitHub's anchor slugs: lowercase, punctuation dropped, spaces → dashes. */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Splits markdown at `#`–`###` headings (code fences are never split). */
export function splitSections(doc: string, markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  const stack: { level: number; heading: string }[] = [];
  const used = new Map<string, number>();
  let current: { heading: string; level: number; path: string[]; lines: string[] } = { heading: "", level: 0, path: [], lines: [] };
  let fenced = false;

  const flush = () => {
    const text = current.lines.join("\n").trim();
    if (!current.heading && !text) return;
    const base = current.heading ? slugify(current.heading) : "intro";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    sections.push({ doc, id: `${doc}#${n ? `${base}-${n}` : base}`, heading: current.heading || "Introduction", level: current.level, path: current.path, text });
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) {
      current.lines.push(line);
      continue;
    }
    flush();
    const level = heading[1]!.length;
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    const path = stack.map((s) => s.heading);
    stack.push({ level, heading: heading[2]! });
    current = { heading: heading[2]!, level, path, lines: [line] };
  }
  flush();
  return sections;
}

export interface Docs {
  files: (DocFile & { markdown: string })[];
  sections: Section[];
}

/** Reads every doc that exists in `dir` (missing files are skipped, so a partial checkout still works). */
export function loadDocs(dir: string, files: readonly DocFile[] = DOC_FILES): Docs {
  const loaded = files
    .map((f) => {
      const path = join(dir, f.file);
      return existsSync(path) ? { ...f, markdown: readFileSync(path, "utf8") } : null;
    })
    .filter((f): f is DocFile & { markdown: string } => f !== null);
  return { files: loaded, sections: loaded.flatMap((f) => splitSections(f.id, f.markdown)) };
}

const STOP = new Set(["a", "an", "and", "the", "to", "of", "in", "on", "for", "how", "do", "i", "is", "it", "my", "with", "what", "can", "be", "or", "use"]);

/** Words and dotted API names (`state.update`, `submitFor`) of a query. */
export function terms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9_]+(?:\.[a-z0-9_]+)*/g) ?? [])].filter((t) => !STOP.has(t));
}

export interface Hit {
  section: Section;
  score: number;
  snippet: string;
}

/** Ranks sections by how often (and where) the query's terms appear: heading matches count most. */
export function searchDocs(docs: Docs, query: string, limit = 6): Hit[] {
  const words = terms(query);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const section of docs.sections) {
    const heading = section.heading.toLowerCase();
    const body = section.text.toLowerCase();
    let score = 0;
    let matched = 0;
    for (const word of words) {
      const inHeading = heading.includes(word);
      const count = body.split(word).length - 1;
      if (!inHeading && !count) continue;
      matched++;
      score += (inHeading ? 8 : 0) + Math.min(count, 10) * (word.includes(".") ? 3 : 1);
    }
    if (!matched) continue;
    // Sections that contain every term beat ones that repeat a single term.
    score *= matched / words.length;
    if (matched === words.length && words.length > 1) score *= 1.5;
    hits.push({ section, score, snippet: snippetFor(section.text, words) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function snippetFor(text: string, words: string[]): string {
  const lower = text.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0));
  const start = Math.max(0, at - 120);
  const raw = text.slice(start, start + 320).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${raw}${start + 320 < text.length ? "…" : ""}`;
}

/** A section's text plus its sub-sections (reading `sdk#matches-for-28-players` includes its `###` parts). */
export function readSection(docs: Docs, id: string): string | null {
  const index = docs.sections.findIndex((s) => s.id === id);
  if (index < 0) return null;
  const head = docs.sections[index]!;
  const parts = [head.text];
  for (const next of docs.sections.slice(index + 1)) {
    if (next.doc !== head.doc || next.level <= head.level || head.level === 0) break;
    parts.push(next.text);
  }
  return parts.join("\n\n");
}

/** Table of contents of one doc: section ids and headings, indented by level. */
export function tableOfContents(docs: Docs, doc: string): string | null {
  const sections = docs.sections.filter((s) => s.doc === doc);
  if (!sections.length) return null;
  return sections.map((s) => `${"  ".repeat(Math.max(0, s.level - 1))}- ${s.heading} → \`${s.id}\``).join("\n");
}
