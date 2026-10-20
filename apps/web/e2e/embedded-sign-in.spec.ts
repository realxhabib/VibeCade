import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { FAKE, fakeSupabase } from "./fake-supabase";

// The site framed by another one (Vibras), signing in on partitioned cookies through the popup
// (platform/supabase/embedded.ts). Opt-in, like x-sign-in.spec.ts: needs a build against the
// stand-in Supabase, and openssl. Partitioned cookies need https, so the app is served at
// https://vibecade.test through a local TLS proxy, framed by a stand-in page at Vibras's real address.
test.skip(process.env.NEXT_PUBLIC_SUPABASE_URL !== FAKE, `needs a build against ${FAKE}`);

const SITE = "https://vibecade.test";
/** Set to a folder to save screenshots of each step. */
const SHOTS = process.env.E2E_SCREENSHOTS;
const TLS_PORT = 8443;
test.use({
  ignoreHTTPSErrors: true,
  launchOptions: {
    args: [
      `--host-resolver-rules=MAP vibecade.test:443 127.0.0.1:${TLS_PORT}`,
      // Straight to the local proxy, past any system proxy (which can't reach it).
      "--proxy-server=direct://",
      // The stand-in Vibras is a public address framing one that resolves to this machine.
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForIframes,PrivateNetworkAccessForNavigations,LocalNetworkAccessChecks",
    ],
  },
});

let proxy: Server;
test.beforeAll(async ({ baseURL }) => {
  const dir = mkdtempSync(join(tmpdir(), "vibecade-tls-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=vibecade.test", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const app = new URL(baseURL!);
  proxy = createServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (req, res) => {
    const upstream = httpRequest(
      { host: app.hostname, port: app.port, path: req.url, method: req.method, headers: { ...req.headers, host: "vibecade.test", "x-forwarded-proto": "https", "x-forwarded-host": "vibecade.test" } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy.listen(TLS_PORT, "127.0.0.1", resolve));
});
test.afterAll(() => new Promise<void>((resolve) => proxy.close(() => resolve())));

test("framed by Vibras: signs in through the popup, on partitioned cookies only that frame sees", async ({ page, context }) => {
  const parked = await fakeSupabase(context);
  await context.route("https://www.vibras.si/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body style="margin:0;background:#0b0b10"><iframe src="${SITE}/login" style="border:0;width:100vw;height:100vh"></iframe></body>`,
    }),
  );
  await page.goto("https://www.vibras.si/");
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("button", { name: "Continue with X" })).toBeEnabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-framed-signed-out.png` });
  const [popup] = await Promise.all([context.waitForEvent("page"), frame.getByRole("button", { name: "Continue with X" }).click()]);
  await popup.waitForEvent("close");
  // Back on the home page inside the frame, signed in.
  await expect(frame.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(frame.getByRole("heading", { name: /@tess_test/ })).toBeVisible();
  await expect(frame.getByRole("button", { name: "Account menu" })).toBeVisible();
  expect(parked.size).toBe(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-framed-signed-in.png` });

  const cookies = (await context.cookies(SITE)).filter((c) => c.name.startsWith("sb-") || c.name === "vibecade-embedded");
  expect(cookies.map((c) => c.name)).toContain("vibecade-embedded");
  expect(cookies.some((c) => c.name.startsWith("sb-"))).toBe(true);
  for (const cookie of cookies) expect([cookie.sameSite, cookie.secure, cookie.partitionKey]).toEqual(["None", true, "https://vibras.si"]);

  // A normal visit has its own cookie jar: signed out, and none of the frame's cookies.
  const visit = await context.newPage();
  await visit.goto(`${SITE}/login`);
  await expect(visit.getByRole("button", { name: "Continue with X" })).toBeEnabled();
  if (SHOTS) await visit.screenshot({ path: `${SHOTS}/3-normal-visit-unchanged.png` });
});
