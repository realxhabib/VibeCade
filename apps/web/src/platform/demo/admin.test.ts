import { fakeSessionStorage, resetFakeBrowser } from "./fake-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackendError } from "../backend";
import type { Profile, RegisterAppInput } from "../types";
import { DemoBackend } from "./demo-backend";
import { mutate } from "./store";

let backend: DemoBackend;
const people: Record<string, Profile> = {};

async function as(handle: string): Promise<Profile> {
  const profile = people[handle] ?? (await backend.demo.signInAs({ handle }));
  people[handle] = profile;
  await backend.demo.switchTo(profile.id);
  return profile;
}

const input: RegisterAppInput = {
  slug: "admin-crm",
  name: "Admin CRM",
  tagline: "Open me",
  description: "",
  category: "tools",
  icon: "📇",
  accent: ["#000000", "#ffffff"],
  url: "https://crm.example.com/",
  modes: ["practice"],
  scoring: "high",
  howTo: [],
  kind: "app",
};

async function expectError(promise: Promise<unknown>, code: BackendError["code"]): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BackendError);
  expect((error as BackendError).code).toBe(code);
}

beforeEach(async () => {
  resetFakeBrowser();
  for (const key of Object.keys(people)) delete people[key];
  fakeSessionStorage.setItem("xapps:demo-invited", "1");
  backend = new DemoBackend();
  // Bob's app, still unlisted; Carol opens his other, published one.
  await as("bob");
  await backend.registerApp(input);
  await backend.registerApp({ ...input, slug: "admin-crm-live", name: "Admin CRM Live" });
  mutate((db) => {
    db.apps["admin-crm-live"]!.status = "published";
  });
  await as("carol");
  await backend.openApp("admin-crm-live");
  await backend.openApp("admin-crm-live");
});

afterEach(() => {
  backend.dispose();
});

describe("demo backend: admin overview", () => {
  it("is for admins only", async () => {
    await as("bob");
    await expectError(backend.adminOverview(), "forbidden");
    await expectError(backend.adminPlayers(), "forbidden");
  });

  it("covers every app, including other people's unlisted ones and official ones", async () => {
    await as("rita");
    await backend.demo.setAdmin(true);
    await expectError(backend.adminOverview(0), "invalid");
    const overview = await backend.adminOverview(7);
    expect(overview.days).toBe(7);
    expect(overview.series).toHaveLength(7);
    const slugs = overview.apps.map((a) => a.app.slug);
    expect(slugs).toContain("admin-crm");
    expect(slugs).toContain("quick-draw");
    expect(overview.totals.apps).toBe(overview.apps.length);
    expect(overview.totals.listedApps).toBe(overview.apps.filter((a) => a.app.status === "published").length);
    const live = overview.apps.find((a) => a.app.slug === "admin-crm-live")!;
    expect(live.roster).toBe(1);
    expect(live.opens).toBe(2);
    expect(live.lastActiveAt).not.toBeNull();
    expect(overview.totals.activePlayers).toBeGreaterThanOrEqual(1);
    expect(overview.totals.matches).toBe(overview.series.reduce((n, d) => n + d.matches, 0));
  });

  it("lists everyone with their activity across apps", async () => {
    await as("rita");
    await backend.demo.setAdmin(true);
    const all = await backend.adminPlayers();
    expect(all.total).toBe(all.players.length);
    expect(all.players.map((p) => p.profile.handle)).toEqual(expect.arrayContaining(["bob", "carol", "rita"]));
    const carol = (await backend.adminPlayers({ query: "@CAROL" })).players;
    expect(carol).toHaveLength(1);
    expect(carol[0]).toMatchObject({ opens: 2, apps: 1 });
    expect(carol[0]!.lastSeenAt).not.toBeNull();
    expect((await backend.adminPlayers({ limit: 1 })).players).toHaveLength(1);
  });
});
