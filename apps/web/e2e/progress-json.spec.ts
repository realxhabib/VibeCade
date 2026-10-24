import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a developer sets stats and achievements from JSON", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = String(Date.now()).slice(-6);
  await signIn(page, `json${suffix}`);
  await page.goto("/developers/new");
  await page.getByPlaceholder("Tap Race").fill(`Level Rush ${suffix}`);
  await page.getByPlaceholder("Ten seconds. Fastest thumbs win.").fill("Clear the levels, beat the clock.");
  await page.getByPlaceholder("https://tap-race.dev").fill("http://localhost:3000/examples/rps/index.html");

  await page.getByRole("button", { name: /Stats & achievements as JSON/ }).click();
  const box = page.getByLabel("Stats and achievements JSON");
  // Invalid definitions are refused without touching the rows.
  await box.fill(JSON.stringify({ achievements: [{ name: "Too much", xp: 500 }] }));
  await page.getByRole("button", { name: "Apply JSON" }).click();
  await expect(page.getByText(/XP must be a whole number/)).toBeVisible();

  await box.fill(
    JSON.stringify({
      stats: [{ label: "Best time", aggregate: "min", format: "ms" }],
      achievements: [
        { name: "Level 1", icon: "🥉", xp: 10 },
        { name: "Level 2", icon: "🥈", xp: 20 },
      ],
    }),
  );
  await page.getByRole("button", { name: "Apply JSON" }).click();
  await expect(page.getByText("Applied: 1 stat · 2 achievements (30 XP)")).toBeVisible();
  await expect(page.getByLabel("Stat 1 key")).toHaveValue("best_time");
  await expect(page.getByLabel("Achievement 2 id")).toHaveValue("level_2");

  // Merging adds a new level and keeps the others.
  await page.getByRole("tab", { name: "Merge by id" }).click();
  await box.fill(JSON.stringify([{ id: "level_3", name: "Level 3", icon: "🥇", xp: 30 }]));
  await page.getByRole("button", { name: "Apply JSON" }).click();
  await expect(page.getByLabel("Achievement 3 name")).toHaveValue("Level 3");
  await expect(page.getByLabel("Achievement 1 name")).toHaveValue("Level 1");

  await page.getByRole("button", { name: "Submit app" }).click();
  await expect(page.getByText(/1\.0\.0/).first()).toBeVisible({ timeout: 15_000 });
  await page.goto(`/apps/level-rush-${suffix}`);
  await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
  await expect(page.getByText("Level 3")).toBeVisible();
});
