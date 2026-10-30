// Bundles the server into one file (dist/vibecade-mcp.js) and copies the docs
// it serves into dist/docs. The manifest validators and the app scanner come
// from the VibeCade web app's source (apps/web/src/platform), so the checks
// here are the ones the site runs.
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL(".", import.meta.url)));
rmSync("dist", { recursive: true, force: true });

await build({
  absWorkingDir: process.cwd(),
  entryPoints: ["src/main.ts"],
  outfile: "dist/vibecade-mcp.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  tsconfig: "tsconfig.json",
  // Scaffolding reads create-vibecade's templates from its own folder, so it stays a real dependency.
  external: ["create-vibecade"],
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "warning",
});

/** Served docs: [source in the repo, name in dist/docs]. Keep in sync with DOC_FILES in src/docs.ts. */
export const DOCS = [
  ["../sdk/README.md", "sdk.md"],
  ["../../docs/build-a-game.md", "build-a-game.md"],
  ["../create-vibecade/README.md", "create-vibecade.md"],
  ["../../mods/vibecade-dev/skills/vibecade-game/SKILL.md", "skill.md"],
  ["../../mods/vibecade-dev/skills/vibecade-game/references/api.md", "api.md"],
  ["../../mods/vibecade-dev/skills/vibecade-game/references/patterns.md", "patterns.md"],
  ["../../mods/vibecade-dev/skills/vibecade-game/references/manifest.md", "manifest.md"],
];
mkdirSync("dist/docs", { recursive: true });
for (const [from, to] of DOCS) {
  if (!existsSync(from)) throw new Error(`Missing doc ${from}`);
  copyFileSync(from, `dist/docs/${to}`);
}
console.log("vibecade-mcp built → dist/");
