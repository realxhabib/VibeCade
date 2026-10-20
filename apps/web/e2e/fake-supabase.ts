import type { BrowserContext, Route } from "@playwright/test";

/** The stand-in Supabase the sign-in tests build the app against (see x-sign-in.spec.ts). */
export const FAKE = "https://fake-supa.test";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp, session_id: "s1" })}.sig`;
const user = { id: USER_ID, aud: "authenticated", role: "authenticated", app_metadata: { provider: "x" }, user_metadata: { user_name: "tess_test" }, created_at: new Date().toISOString() };
const profile = { id: USER_ID, handle: "tess_test", name: "Tess Test", avatar_url: null, bio: "", xp: 0, wins: 0, losses: 0, draws: 0, streak: 0, best_streak: 0, created_at: user.created_at, is_bot: false, is_admin: false };

/** Stands in for Supabase (and X): sign-in, the session hand-off RPCs and the profile. */
export async function fakeSupabase(context: BrowserContext): Promise<Map<string, object>> {
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
  return parked;
}
