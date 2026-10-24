import { expect, test } from "@playwright/test";
import { FAKE, fakeSupabase } from "./fake-supabase";

// The card's popup sign-in against a stand-in Supabase (and X). Opt-in: build and serve the app with
//   NEXT_PUBLIC_SUPABASE_URL=https://fake-supa.test NEXT_PUBLIC_SUPABASE_ANON_KEY=fake NEXT_PUBLIC_SUPABASE_X_PROVIDER=x
// then run with the same NEXT_PUBLIC_SUPABASE_URL (and E2E_BASE_URL pointing at that server).
test.skip(process.env.NEXT_PUBLIC_SUPABASE_URL !== FAKE, `needs a build against ${FAKE}`);

test("framed in a post (desktop): signs in through the popup and the hand-off, then out", async ({ page, context }) => {
  const parked = await fakeSupabase(context);
  // The post preview frames the card at 480×480, like X does.
  await page.goto("/x/preview?app=four-in-a-row");
  const card = page.frameLocator("iframe");
  const signIn = card.getByRole("button", { name: /Sign in with X to challenge/ });
  const [popup] = await Promise.all([context.waitForEvent("page"), signIn.click()]);
  await popup.waitForEvent("close");
  await expect(card.getByText("@tess_test")).toBeVisible();
  await expect(card.getByRole("button", { name: /Post a challenge/ })).toBeVisible();
  expect(parked.size).toBe(0);

  await card.getByRole("button", { name: "Sign out" }).click();
  await expect(signIn).toBeVisible();
});

test("the whole page (the X phone apps): signs in with a redirect in the same tab, no popup, no code", async ({ page, context }) => {
  const parked = await fakeSupabase(context);
  let popups = 0;
  context.on("page", () => popups++);
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/x/play/four-in-a-row");
  await page.getByRole("button", { name: /Sign in with X to challenge/ }).click();
  // Back on the card, signed in.
  await expect(page).toHaveURL(/\/x\/play\/four-in-a-row$/);
  await expect(page.getByText("@tess_test")).toBeVisible();
  await expect(page.getByRole("button", { name: /Post a challenge/ })).toBeVisible();
  expect(popups).toBe(0);
  expect(parked.size).toBe(0);
});

test("a sign-in link opened any other way asks to match the card's code first", async ({ page, context }) => {
  let wentToX = false;
  await context.route(`${FAKE}/**`, (route) => {
    if (new URL(route.request().url()).pathname === "/auth/v1/authorize") wentToX = true;
    return route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/x/auth#n=someoneelsescodesomeoneelsescodesomeone");
  await expect(page.getByRole("button", { name: "It matches, continue" })).toBeVisible();
  await expect(page.getByText(/^[ACDEFGHJKMNPRTUVWXY34679]{4}$/)).toBeVisible();
  expect(wentToX).toBe(false);
});
