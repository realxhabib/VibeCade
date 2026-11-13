import { describe, expect, it } from "vitest";
import {
  PresenceHub,
  activityForMatch,
  activityLabel,
  canInterrupt,
  cleanActivity,
  joinableLobby,
  mergePresence,
  newLobbyAlerts,
  type OnlineActivity,
  type PresenceEntry,
  type PresenceMeta,
  type PresenceTransport,
} from "./presence";
import type { Match, MatchPlayer, Profile } from "./types";

const meta = (handle: string, activity: OnlineActivity | null, at = 1): PresenceMeta => ({ handle, name: handle, avatarUrl: null, activity, at });
const lobby = (matchId: string, open = true, seatsLeft = 1): OnlineActivity => ({ kind: "lobby", matchId, appSlug: "frontline", mode: "live", open, seatsLeft });

describe("cleanActivity", () => {
  it("keeps well-formed activities and drops the rest", () => {
    expect(cleanActivity(lobby("m1"))).toEqual(lobby("m1"));
    expect(cleanActivity({ kind: "playing", matchId: "m1", appSlug: "x", mode: "practice" })).toEqual({ kind: "playing", matchId: "m1", appSlug: "x", mode: "practice" });
    expect(cleanActivity({ kind: "playing", matchId: "m1", appSlug: "x", mode: "nope" })).toBeNull();
    expect(cleanActivity({ kind: "lobby", matchId: "", appSlug: "x", mode: "live" })).toBeNull();
    expect(cleanActivity("lobby")).toBeNull();
    // A lobby with no seats left isn't open, whatever it says.
    expect(cleanActivity({ ...lobby("m1"), seatsLeft: 0 })).toMatchObject({ open: false, seatsLeft: 0 });
  });
});

describe("mergePresence", () => {
  it("shows each person once, by their busiest tab, open lobbies first", () => {
    const entries: PresenceEntry[] = [
      { userId: "a", metas: [meta("ann", null, 5)] },
      { userId: "b", metas: [meta("bob", null, 9), meta("bob", { kind: "playing", matchId: "m2", appSlug: "x", mode: "live" }, 3)] },
      { userId: "c", metas: [meta("cat", lobby("m3"), 1)] },
      { userId: "d", metas: [{ ...meta("", null), handle: "" }] },
    ];
    const players = mergePresence(entries);
    expect(players.map((p) => p.handle)).toEqual(["cat", "bob", "ann"]);
    expect(players[1]!.activity?.kind).toBe("playing");
  });
});

describe("joinableLobby / canInterrupt / activityLabel", () => {
  it("reads lobbies and labels", () => {
    const [p] = mergePresence([{ userId: "a", metas: [meta("ann", lobby("m1", true, 2))] }]);
    expect(joinableLobby(p!)?.matchId).toBe("m1");
    expect(activityLabel(p!.activity, "Frontline")).toBe("Waiting in the Frontline lobby · 2 seats left");
    expect(activityLabel(null, undefined)).toBe("Hanging out");
    expect(canInterrupt(null)).toBe(true);
    expect(canInterrupt({ kind: "playing", matchId: "m", appSlug: "x", mode: "practice" })).toBe(true);
    expect(canInterrupt({ kind: "playing", matchId: "m", appSlug: "x", mode: "live" })).toBe(false);
  });
});

describe("newLobbyAlerts", () => {
  it("announces each open lobby once, never the viewer's own or one they're in", () => {
    const announced = new Set<string>();
    const players = mergePresence([
      { userId: "me", metas: [meta("me", lobby("mine"))] },
      { userId: "a", metas: [meta("ann", lobby("m1"))] },
      { userId: "b", metas: [meta("bob", lobby("m2", false))] },
      { userId: "c", metas: [meta("cat", lobby("mine"))] },
    ]);
    expect(newLobbyAlerts(players, "me", lobby("mine"), announced).map((p) => p.handle)).toEqual(["ann"]);
    expect(newLobbyAlerts(players, "me", null, announced)).toEqual([]);
  });
});

function player(userId: string, extra: Partial<MatchPlayer> = {}): MatchPlayer {
  return { userId, seat: 0, team: null, role: "player", rank: null, state: "joined", isBot: false, score: null, submission: null, result: null, xpDelta: 0, lastSeenAt: null, profile: {} as Profile, ...extra };
}

describe("activityForMatch", () => {
  const base = { id: "m1", appSlug: "frontline", mode: "live", status: "open", isOpen: true, maxPlayers: 4, players: [] } as unknown as Match;
  it("is a lobby while it fills, playing once it runs", () => {
    const me = player("me");
    const match = { ...base, players: [me, player("x", { seat: 1 })] } as Match;
    expect(activityForMatch(match, me)).toEqual({ kind: "lobby", matchId: "m1", appSlug: "frontline", mode: "live", open: true, seatsLeft: 2 });
    expect(activityForMatch({ ...match, status: "active" }, me)).toEqual({ kind: "playing", matchId: "m1", appSlug: "frontline", mode: "live" });
    expect(activityForMatch({ ...match, status: "completed" }, me)).toBeNull();
    expect(activityForMatch({ ...match, versionId: "v1" }, me)).toBeNull();
    expect(activityForMatch(match, { ...me, state: "invited" })).toBeNull();
    expect(activityForMatch(match, undefined)).toBeNull();
  });
});

describe("PresenceHub", () => {
  it("joins once per viewer, shares activity changes and leaves on sign out", () => {
    const tracked: PresenceMeta[] = [];
    let closed = 0;
    let sync: ((entries: PresenceEntry[]) => void) | null = null;
    const opened: string[] = [];
    const hub = new PresenceHub((viewerId): PresenceTransport => {
      opened.push(viewerId);
      return {
        track: (m) => tracked.push(m),
        onSync: (h) => {
          sync = h;
          return () => (sync = null);
        },
        close: () => closed++,
      };
    });
    const viewer = { id: "me", handle: "me", name: "Me", avatarUrl: null } as Profile;
    hub.connect(viewer);
    hub.connect(viewer);
    expect(opened).toEqual(["me"]);
    hub.setActivity(lobby("m1"));
    hub.setActivity(lobby("m1"));
    expect(tracked.map((m) => m.activity?.kind ?? null)).toEqual([null, "lobby"]);
    let heard = 0;
    hub.subscribe(() => heard++);
    sync!([{ userId: "me", metas: [tracked[1]!] }]);
    expect(heard).toBe(1);
    expect(hub.snapshot()[0]?.handle).toBe("me");
    hub.connect(null);
    expect(closed).toBe(1);
    expect(hub.snapshot()).toEqual([]);
  });
});

describe("PresenceHub status", () => {
  it("reports whether the channel is joined, so an empty list isn't read as nobody online", () => {
    let report: ((s: "connecting" | "live" | "unavailable") => void) | null = null;
    const hub = new PresenceHub(() => ({
      track: () => undefined,
      onSync: () => () => undefined,
      onStatus: (h) => {
        report = h;
        h("connecting");
        return () => (report = null);
      },
      close: () => undefined,
    }));
    expect(hub.statusSnapshot()).toBe("off");
    hub.connect({ id: "me", handle: "me", name: "Me", avatarUrl: null } as Profile);
    expect(hub.statusSnapshot()).toBe("connecting");
    report!("unavailable");
    expect(hub.statusSnapshot()).toBe("unavailable");
    report!("live");
    expect(hub.statusSnapshot()).toBe("live");
    hub.connect(null);
    expect(hub.statusSnapshot()).toBe("off");
  });
});
