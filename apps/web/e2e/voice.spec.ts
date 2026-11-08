import { expect, test } from "@playwright/test";

// Chromium's fake microphone (a beeping tone) and no permission prompt.
test.use({
  launchOptions: async ({ launchOptions }, provide) => {
    await provide({ ...launchOptions, args: [...(launchOptions.args ?? []), "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  },
  permissions: ["microphone"],
});

test("two players talk over voice chat in a live match", async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("xapps:force-demo", "1");
    sessionStorage.setItem("xapps:demo-banner", "hidden");
    sessionStorage.setItem("xapps:demo-invited", "1");
  });
  const suffix = Date.now().toString(36).slice(-4);
  const [alice, bob] = [await context.newPage(), await context.newPage()];
  for (const [page, handle] of [
    [alice, `alice${suffix}`],
    [bob, `bob${suffix}`],
  ] as const) {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("xapps:demo-last-viewer"));
    await page.goto("/login");
    await page.getByLabel("Demo handle").fill(handle);
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page).toHaveURL("/");
  }

  await alice.goto("/apps/rps-showdown");
  await alice.getByRole("button", { name: "Challenge someone" }).click();
  await alice.getByLabel("Search players by handle").fill(`bob${suffix}`);
  await alice.getByRole("button", { name: new RegExp(`@bob${suffix}`) }).click();
  await alice.getByRole("button", { name: `Challenge @bob${suffix}` }).click();
  await expect(alice).toHaveURL(/\/play\//);
  await bob.getByRole("button", { name: "View" }).click();
  await bob.getByRole("button", { name: "Accept challenge" }).click();
  await expect(alice.frameLocator("iframe").getByRole("button", { name: "Paper" })).toBeEnabled({ timeout: 30_000 });

  await alice.getByRole("button", { name: "Join voice chat" }).click();
  await expect(alice.getByRole("button", { name: "Mute", exact: true })).toBeVisible();
  // Bob sees Alice is in voice before he joins.
  await expect(bob.getByLabel("1 in voice")).toBeVisible();
  await bob.getByRole("button", { name: "Join voice chat" }).click();

  // Both seats show the other in voice, and the call connects.
  await expect(alice.getByLabel(/^(In voice|Talking)$/).first()).toBeVisible();
  await alice.getByRole("button", { name: "Match options" }).click();
  const menu = alice.getByText(/Voice · 2 in call/);
  await expect(menu).toBeVisible();
  await expect(alice.getByText("connecting…")).toBeHidden({ timeout: 20_000 });
  await expect(alice.getByText("can't connect")).toBeHidden();
  await alice.keyboard.press("Escape");

  // Muting shows on the other side.
  await bob.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(bob.getByRole("button", { name: "Unmute" })).toBeVisible();
  await expect(alice.getByLabel("In voice, muted")).toBeVisible();

  // Leaving takes Bob out of Alice's call.
  await bob.getByRole("button", { name: "Match options" }).click();
  await bob.getByRole("button", { name: "Leave voice" }).click();
  await expect(alice.getByLabel("In voice, muted")).toBeHidden();
});

test("a call started in the lobby carries on into the match", async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("xapps:force-demo", "1");
    sessionStorage.setItem("xapps:demo-banner", "hidden");
    sessionStorage.setItem("xapps:demo-invited", "1");
  });
  const suffix = Date.now().toString(36).slice(-4);
  const [host, guest] = [await context.newPage(), await context.newPage()];
  for (const [page, handle] of [
    [host, `vhost${suffix}`],
    [guest, `vguest${suffix}`],
  ] as const) {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("xapps:demo-last-viewer"));
    await page.goto("/login");
    await page.getByLabel("Demo handle").fill(handle);
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page).toHaveURL("/");
  }

  await host.goto("/apps/rps-showdown");
  await host.getByRole("button", { name: "Challenge someone" }).click();
  await host.getByRole("button", { name: /Open challenge/ }).click();
  await host.getByRole("button", { name: "Create open challenge" }).click();
  await expect(host).toHaveURL(/\/play\//);

  // Talk while waiting.
  await host.getByRole("button", { name: "Join voice chat" }).click();
  await expect(host.getByRole("button", { name: "Mute", exact: true })).toBeVisible();
  await expect(host.getByText("Just you")).toBeVisible();

  // The guest takes the seat: the match starts and the host is still in the call.
  const link = (await host.getByText(/\/play\/[^/?]+\?join=1$/).textContent())!;
  await guest.goto(link);
  await expect(guest.frameLocator("iframe").getByRole("button", { name: "Paper" })).toBeVisible({ timeout: 30_000 });
  await expect(host.frameLocator("iframe").getByRole("button", { name: "Paper" })).toBeVisible({ timeout: 30_000 });
  await expect(host.getByRole("button", { name: "Mute", exact: true })).toBeVisible();
  await expect(guest.getByLabel("1 in voice")).toBeVisible();
  await guest.getByRole("button", { name: "Join voice chat" }).click();
  await host.getByRole("button", { name: "Match options" }).click();
  await expect(host.getByText(/Voice · 2 in call/)).toBeVisible();
  await expect(host.getByText("connecting…")).toBeHidden({ timeout: 20_000 });
  await expect(host.getByText("can't connect")).toBeHidden();
});
