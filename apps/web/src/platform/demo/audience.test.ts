import { fakeSessionStorage, resetFakeBrowser } from "./fake-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackendError } from "../backend";
import type { Profile, RegisterAppInput } from "../types";
import { demoEmail } from "./audience";
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
  slug: "crm-app",
  name: "CRM App",
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
  await as("bob");
  await backend.registerApp(input);
  mutate((db) => {
    db.apps[input.slug]!.status = "published";
  });
});

afterEach(() => {
  backend.dispose();
});

describe("demo backend: app audience", () => {
  it("lists signed-in openers for the owner, with emails only once shared", async () => {
    const carol = await as("carol");
    await backend.openApp(input.slug);
    await backend.openApp(input.slug);
    expect(await backend.getEmailSharing(input.slug)).toBe(false);

    await as("bob");
    let roster = await backend.appPlayers(input.slug);
    expect(roster.total).toBe(1);
    expect(roster.emailsShared).toBe(0);
    expect(roster.newThisWeek).toBe(1);
    expect(roster.players[0]).toMatchObject({ profile: { id: carol.id }, opens: 2, matches: 0, email: null, emailSharedAt: null });

    await as("carol");
    expect(await backend.setEmailSharing(input.slug, true)).toBe(true);
    expect(await backend.getEmailSharing(input.slug)).toBe(true);
    await as("bob");
    roster = await backend.appPlayers(input.slug);
    expect(roster.emailsShared).toBe(1);
    expect(roster.players[0]!.email).toBe(demoEmail("carol"));
    expect(roster.players[0]!.emailSharedAt).toBeTruthy();

    await as("carol");
    expect(await backend.setEmailSharing(input.slug, false)).toBe(false);
    await as("bob");
    roster = await backend.appPlayers(input.slug);
    expect(roster.total).toBe(1);
    expect(roster.players[0]!.email).toBeNull();
  });

  it("is owner only, and filters by handle or name", async () => {
    await as("carol");
    await backend.openApp(input.slug);
    await as("dave");
    await backend.openApp(input.slug);
    await expectError(backend.appPlayers(input.slug), "forbidden");

    await as("bob");
    expect((await backend.appPlayers(input.slug, { query: "@car" })).players.map((p) => p.profile.handle)).toEqual(["carol"]);
    const all = await backend.appPlayers(input.slug, { query: "nobody-here", limit: 1 });
    expect(all.players).toEqual([]);
    expect(all.total).toBe(2);
    expect((await backend.appPlayers(input.slug, { limit: 1 })).players).toHaveLength(1);
  });

  it("only shares with apps the player can see", async () => {
    mutate((db) => {
      db.apps[input.slug]!.status = "pending";
    });
    await as("carol");
    await expectError(backend.setEmailSharing(input.slug, true), "not_found");
    expect(await backend.setEmailSharing(input.slug, false)).toBe(false);
    await expectError(backend.setEmailSharing("no-such-app", false), "not_found");
  });

  it("counts seats in live matches of a game", async () => {
    await as("carol");
    const match = await backend.startPractice("quick-draw");
    expect(match.players.some((p) => p.userId === people.carol!.id)).toBe(true);
    await as("bob");
    await backend.demo.setAdmin(true);
    const roster = await backend.appPlayers("quick-draw");
    expect(roster.players.find((p) => p.profile.handle === "carol")).toMatchObject({ matches: 1, opens: 0 });
  });
});
