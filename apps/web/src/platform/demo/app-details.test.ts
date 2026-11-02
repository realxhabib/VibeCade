import { fakeSessionStorage, resetFakeBrowser } from "./fake-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackendError } from "../backend";
import { detailsOf, manifestOf } from "../shipping";
import type { Profile, RegisterAppInput } from "../types";
import { DemoBackend } from "./demo-backend";

let backend: DemoBackend;
const people: Record<string, Profile> = {};

async function as(handle: string): Promise<Profile> {
  const profile = people[handle] ?? (await backend.demo.signInAs({ handle }));
  people[handle] = profile;
  await backend.demo.switchTo(profile.id);
  return profile;
}

function appInput(slug: string, extra: Partial<RegisterAppInput> = {}): RegisterAppInput {
  return {
    slug,
    name: "Tap Race",
    tagline: "Tap fast to win",
    description: "",
    category: "games",
    icon: "👆",
    accent: ["#000000", "#ffffff"],
    url: "https://tap.example.com/",
    modes: ["live", "practice"],
    scoring: "high",
    howTo: [],
    ...extra,
  };
}

async function expectError(promise: Promise<unknown>, code: BackendError["code"]): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BackendError);
  expect((error as BackendError).code).toBe(code);
}

beforeEach(() => {
  resetFakeBrowser();
  for (const key of Object.keys(people)) delete people[key];
  fakeSessionStorage.setItem("xapps:demo-invited", "1");
  backend = new DemoBackend();
});

afterEach(() => {
  backend.dispose();
});

describe("test first", () => {
  it("registers 1.0.0 as a draft that the console can submit", async () => {
    await as("alice");
    const app = await backend.registerApp(appInput("tap-race", { submit: false }));
    expect(app.status).toBe("pending");
    expect("submit" in app).toBe(false);
    const [first] = await backend.listAppVersions("tap-race");
    expect(first).toMatchObject({ version: "1.0.0", status: "draft", submittedAt: null });
    const sent = await backend.submitAppVersion(first!.id);
    expect(sent.status).toBe("in_review");
  });

  it("still submits by default", async () => {
    await as("alice");
    await backend.registerApp(appInput("tap-race"));
    const [first] = await backend.listAppVersions("tap-race");
    expect(first!.status).toBe("published");
  });
});

describe("updateAppDetails", () => {
  it("changes the listing and the versions in place, never the url or gameplay", async () => {
    await as("alice");
    const app = await backend.registerApp(appInput("tap-race"));
    const draft = await backend.createAppVersion("tap-race", { version: "1.1.0", url: "https://tap.example.com/v2", manifest: manifestOf(app), notes: "" });
    const details = {
      ...detailsOf(manifestOf(app)),
      name: "Tap Race Deluxe",
      icon: "🚀",
      achievements: [{ id: "first", name: "First", description: "Win once", icon: "🏆", xp: 10 }],
      // Not details: ignored.
      modes: ["async"],
      url: "https://evil.example.com/",
    } as Parameters<DemoBackend["updateAppDetails"]>[1];
    const updated = await backend.updateAppDetails("tap-race", details);
    expect(updated).toMatchObject({ name: "Tap Race Deluxe", icon: "🚀", url: "https://tap.example.com/", modes: ["live", "practice"] });
    expect(updated.achievements).toHaveLength(1);
    const versions = await backend.listAppVersions("tap-race");
    expect(versions).toHaveLength(2);
    for (const v of versions) {
      expect(v.manifest).toMatchObject({ name: "Tap Race Deluxe", icon: "🚀", modes: ["live", "practice"] });
      expect(v.manifest.achievements).toHaveLength(1);
    }
    expect(versions.find((v) => v.id === draft.id)!.url).toBe("https://tap.example.com/v2");
    expect((await backend.getApp("tap-race"))!.name).toBe("Tap Race Deluxe");
  });

  it("checks the details and the owner", async () => {
    await as("alice");
    const app = await backend.registerApp(appInput("tap-race"));
    await expectError(backend.updateAppDetails("tap-race", { ...detailsOf(manifestOf(app)), name: "x" }), "invalid");
    await as("bob");
    await expectError(backend.updateAppDetails("tap-race", detailsOf(manifestOf(app))), "forbidden");
  });
});
