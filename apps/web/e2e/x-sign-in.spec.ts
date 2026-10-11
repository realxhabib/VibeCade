import { expect, test, type Route } from "@playwright/test";

// The card's popup sign-in against a stand-in Supabase (and X). Opt-in: build and serve the app with
//   NEXT_PUBLIC_SUPABASE_URL=https://fake-supa.test NEXT_PUBLIC_SUPABASE_ANON_KEY=fake NEXT_PUBLIC_SUPABASE_X_PROVIDER=x
// then run with the same NEXT_PUBLIC_SUPABASE_URL (and E2E_BASE_URL pointing at that server).
const FAKE = "https://fake-supa.test";
test.skip(process.env.NEXT_PUBLIC_SUPABASE_URL !== FAKE, `needs a build against ${FAKE}`);

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp, session_id: "s1" })}.sig`;
const user = { id: USER_ID, aud: "authenticated", role: "authenticated", app_metadata: { provider: "x" }, user_metadata: { user_name: "tess_test" }, created_at: new Date().toISOString() };
const profile = { id: USER_ID, handle: "tess_test", name: "Tess Test", avatar_url: null, bio: "", xp: 0, wins: 0, losses: 0, draws: 0, streak: 0, best_streak: 0, created_at: user.created_at, is_bot: false, is_admin: false };

test("signs the card in through the popup and the hand-off, then out", async ({ page, context }) => {
  const parked = new Map<string, object>();
  await context.route(`${FAKE}/**`, async (route: Route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": req.headers().origin ?? "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
    const url = new URL(req.url());
    switch (url.pathname) {
      case "/auth/v1/authorize": {
        // Stands in for X: straight back with a code.
        const back = new URL(url.searchParams.get("redirect_to")!);
        back.searchParams.set("code", "auth-code-1");
        return route.fulfill({ status: 302, headers: { location: back.toString() } });
      }
      case "/auth/v1/token":
        return json({ access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "refresh-1", user });
      case "/auth/v1/user":
        return json(user);
      case "/rest/v1/rpc/put_x_auth_handoff": {
        if (!(req.headers().authorization ?? "").includes(jwt)) return json({ message: "not signed in" }, 401);
        const body = req.postDataJSON();
        parked.set(body.p_nonce, { access_token: body.p_access_token, refresh_token: body.p_refresh_token });
        return route.fulfill({ status: 204, headers: cors });
      }
      case "/rest/v1/rpc/claim_x_auth_handoff": {
        const { p_nonce } = req.postDataJSON();
        const hit = parked.get(p_nonce) ?? null;
        parked.delete(p_nonce);
        return json(hit);
      }
      case "/rest/v1/profiles":
        return json((req.headers().accept ?? "").includes("vnd.pgrst.object") ? profile : [profile]);
      default:
        return json([]);
    }
  });

  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto("/x/play/four-in-a-row");
  const signIn = page.getByRole("button", { name: /Sign in with X to challenge/ });
  const [popup] = await Promise.all([context.waitForEvent("page"), signIn.click()]);
  await popup.waitForEvent("close");
  await expect(page.getByText("@tess_test")).toBeVisible();
  await expect(page.getByRole("button", { name: /Post a challenge/ })).toBeVisible();
  expect(parked.size).toBe(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(signIn).toBeVisible();
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
