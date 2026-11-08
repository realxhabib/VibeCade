import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Two tabs, two people: one opens a lobby, the other sees them online, gets the
// "waiting in the lobby" toast and joins from it.
test("someone online opens a lobby and the other joins from the toast", async ({ context }) => {
  const suffix = Date.now().toString(36).slice(-5);
  const guest = await context.newPage();
  await signIn(guest, `guest${suffix}`);

  const host = await context.newPage();
  await signIn(host, `host${suffix}`);

  // Both see each other in the top bar's online list.
  await guest.getByRole("button", { name: /online/ }).click();
  await expect(guest.getByText(`Host${suffix}`, { exact: false }).or(guest.getByText(`host${suffix}`)).first()).toBeVisible();
  await guest.keyboard.press("Escape");

  await host.goto("/apps/rps-showdown");
  await host.getByRole("button", { name: "Quick match" }).first().click();
  await expect(host).toHaveURL(/\/play\//);
  const matchUrl = host.url();

  const alert = guest.getByRole("status").filter({ hasText: `@host${suffix} is waiting in the lobby` });
  await expect(alert).toBeVisible();
  await guest.screenshot({ path: test.info().outputPath("lobby-alert.png") });
  await alert.getByRole("button", { name: "Join" }).click();
  await expect(guest).toHaveURL(new RegExp(new URL(matchUrl).pathname));
});
