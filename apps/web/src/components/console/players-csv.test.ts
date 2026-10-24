import { describe, expect, it } from "vitest";
import type { AppPlayer, Profile } from "@/platform/types";
import { playersCsv } from "./players-csv";

const player = (profile: Partial<Profile>, email: string | null): AppPlayer => ({
  profile: { id: "1", handle: "carol", name: "Carol", avatarUrl: null, bio: "", xp: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, createdAt: "", ...profile } as Profile,
  matches: 3,
  wins: 1,
  opens: 0,
  firstSeenAt: "2026-10-01T00:00:00Z",
  lastSeenAt: "2026-10-20T00:00:00Z",
  email,
  emailSharedAt: email ? "2026-10-02T00:00:00Z" : null,
});

describe("playersCsv", () => {
  it("writes a header and one row per player, blank where there's no email", () => {
    const csv = playersCsv([player({}, "carol@example.com"), player({ handle: "dave", name: "Dave" }, null)]);
    expect(csv.split("\r\n")).toEqual([
      "handle,name,email,matches,wins,opens,first_seen,last_seen,email_shared_at",
      "carol,Carol,carol@example.com,3,1,0,2026-10-01T00:00:00Z,2026-10-20T00:00:00Z,2026-10-02T00:00:00Z",
      "dave,Dave,,3,1,0,2026-10-01T00:00:00Z,2026-10-20T00:00:00Z,",
      "",
    ]);
  });

  it("quotes commas and quotes, and defuses formulas", () => {
    const csv = playersCsv([player({ name: '=HYPERLINK("x"), hi' }, null)]);
    expect(csv.split("\r\n")[1]).toBe(`carol,"'=HYPERLINK(""x""), hi",,3,1,0,2026-10-01T00:00:00Z,2026-10-20T00:00:00Z,`);
  });
});
