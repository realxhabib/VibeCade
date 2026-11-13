import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// The host of a Frontline lobby changes the match options before the start, and the
// person who joins sees the change.
test("the lobby host changes Frontline's options and the table sees them", async ({ context }) => {
  const suffix = Date.now().toString(36).slice(-5);
  const host = await context.newPage();
  await signIn(host, `host${suffix}`);
  await host.goto("/apps/frontline");
  // The app page can re-render once while it hydrates, swallowing an early click.
  await expect(async () => {
    await host.getByRole("button", { name: "Quick match" }).first().click();
    await expect(host).toHaveURL(/\/play\//, { timeout: 4000 });
  }).toPass();

  const card = host.getByText("Match options").first();
  await expect(card).toBeVisible();
  await expect(host.getByText("Standard settings")).toBeVisible();
  await host.getByRole("button", { name: "Change" }).click();

  const setup = host.frameLocator('iframe[title="Frontline setup"]');
  await setup.getByRole("radio", { name: "Gun game" }).click();
  await setup.getByRole("radio", { name: /Winter/ }).click();
  await host.waitForTimeout(600); // let the pills settle for the screenshot
  await host.screenshot({ path: test.info().outputPath("lobby-options-setup.png") });
  await setup.getByRole("button", { name: /Save options/ }).click();
  await expect(host.getByText("Gun game · 7 min · ❄️ Winter")).toBeVisible();
  await host.setViewportSize({ width: 390, height: 844 });
  await host.getByText("Match options").first().scrollIntoViewIfNeeded();
  await host.waitForTimeout(600);
  await host.screenshot({ path: test.info().outputPath("lobby-options-host-phone.png") });

  const guest = await context.newPage();
  await signIn(guest, `guest${suffix}`);
  await guest.goto(host.url().replace(/\?.*$/, "") + "?join=1");
  await expect(guest.getByText("Gun game · 7 min · ❄️ Winter")).toBeVisible();
  await expect(guest.getByText(`Set by @host${suffix}`)).toBeVisible();
  await expect(guest.getByRole("button", { name: "Change" })).toHaveCount(0);
  await guest.waitForTimeout(800);
  await guest.screenshot({ path: test.info().outputPath("lobby-options-guest.png") });

  // The game starts with them: Frontline's loadout screen shows the gun game ladder and winter.
  await host.getByRole("button", { name: /Start with/ }).click();
  const game = host.frameLocator('iframe[title="Frontline"]');
  await expect(game.getByRole("button", { name: "Gun game", pressed: true })).toBeVisible({ timeout: 30_000 });
  await expect(game.getByText("Winter").first()).toBeVisible();
  // Locked once the host pressed Start: picked in the lobby only.
  await expect(game.getByText("Locked in")).toBeVisible();
  await expect(game.getByRole("button", { name: "Standard" })).toBeDisabled();
});
