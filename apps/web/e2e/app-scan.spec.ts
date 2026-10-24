import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const manifest = JSON.stringify({ name: "Word Duel", tagline: "Spell faster than your rival.", players: { min: 2, max: 4 }, modes: ["live", "practice"] });
const app = `
import { connect } from "vibecade-sdk";
const vc = await connect();
vc.room.on("guess", () => {});
await vc.turn.end();
await vc.stats.report({ words_found: 1, best_time: ms });
await vc.achievements.unlock("first_word");
await vc.submit({ score: points });
`;

test("a developer scans their project folder to fill in the listing", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = String(Date.now()).slice(-6);
  await signIn(page, `scan${suffix}`);
  await page.goto("/developers/new");

  await page.locator("#register-scan-files").setInputFiles([
    { name: "vibecade.manifest.json", mimeType: "application/json", buffer: Buffer.from(manifest) },
    { name: "App.tsx", mimeType: "text/plain", buffer: Buffer.from(app) },
  ]);
  const report = page.getByTestId("scan-report");
  await expect(report.getByText("words_found, best_time")).toBeVisible();
  await expect(report.getByText("2–4 players")).toBeVisible();
  await expect(report.getByText("🥇 first_word")).toBeVisible();
  await report.getByRole("button", { name: /^Apply/ }).click();

  await expect(page.getByText(/Filled in name, tagline/)).toBeVisible();
  await expect(page.getByPlaceholder("Tap Race")).toHaveValue("Word Duel");
  await expect(page.getByPlaceholder("tap-race", { exact: true })).toHaveValue("word-duel");
  await expect(page.getByLabel("Stat 2 key")).toHaveValue("best_time");
  await expect(page.getByLabel("Achievement 1 id")).toHaveValue("first_word");
  await expect(page.getByText("2–4 players · free for all")).toBeVisible();
  await expect(page.getByRole("switch", { name: /Turn-based/ })).toHaveAttribute("aria-checked", "true");
});
