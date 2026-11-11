// Writes the first-party catalog (apps/web/src/platform/catalog.ts) into the iOS app's
// bundle as JSON, with the cover and icon images it names.
// Run from the repo root after `npm ci`: node ios/scripts/export-catalog.mjs
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const web = join(root, "apps/web");
const out = join(root, "ios/VibeCade/Resources");
const tmp = join(root, "ios/scripts/.catalog.mjs");

await build({
  stdin: { contents: 'export { OFFICIAL_APPS, FEATURED_APPS, FEATURED_FALLBACK } from "@/platform/catalog";', resolveDir: web, loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: tmp,
  alias: { "@": join(web, "src"), "vibecade-sdk": join(root, "packages/sdk/src/index.ts") },
  logLevel: "warning",
});
const { OFFICIAL_APPS, FEATURED_APPS, FEATURED_FALLBACK } = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);

mkdirSync(join(out, "Images"), { recursive: true });
const image = (path) => {
  if (!path || !path.startsWith("/")) return null;
  const file = join(web, "public", path);
  if (!existsSync(file)) return null;
  copyFileSync(file, join(out, "Images", basename(file)));
  return basename(file);
};

const games = OFFICIAL_APPS.filter((a) => a.status === "published").map((a) => ({
  slug: a.slug,
  name: a.name,
  tagline: a.tagline,
  description: a.description,
  category: a.category,
  icon: a.icon,
  iconImage: image(a.iconImage),
  coverImage: image(a.coverImage),
  accent: a.accent,
  modes: a.modes ?? [],
  minPlayers: a.players?.min ?? 2,
  maxPlayers: a.players?.max ?? 2,
  teams: a.teams ?? 0,
  turnBased: !!a.turnBased,
  durationLabel: a.durationLabel ?? null,
  howTo: a.howTo ?? [],
  tags: a.tags ?? [],
  official: !!a.official,
  developer: a.developer?.name ?? null,
  achievements: (a.achievements ?? []).filter((x) => !x.secret).map((x) => ({ id: x.id, name: x.name, description: x.description, icon: x.icon, xp: x.xp })),
}));

writeFileSync(join(out, "catalog.json"), JSON.stringify({ featured: [...FEATURED_APPS, ...FEATURED_FALLBACK], games }, null, 2) + "\n");
await import("node:fs").then((fs) => fs.rmSync(tmp));
console.log(`catalog.json: ${games.length} games (${games.map((g) => g.slug).join(", ")})`);
