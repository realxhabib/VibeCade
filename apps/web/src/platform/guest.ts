import type { Backend } from "./backend";
import { DemoBackend } from "./demo/demo-backend";
import type { Profile } from "./types";

const GUEST_KEY = "xapps:x-guest";

/**
 * The person playing inside an X post (the `/x/play` player card). X frames the
 * player on its own site, so the XApps session cookie isn't there and Sign in
 * with X can't run in a frame: they play as a guest on this device, against the
 * practice bots, on the demo backend's engine (the same one offline practice
 * uses). Storage in a frame is partitioned under x.com, so none of this mixes
 * with the site's own demo data.
 */
export function guestProfile(now: () => Date = () => new Date()): Profile {
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(GUEST_KEY);
    if (!id) {
      id = `guest-${crypto.randomUUID()}`;
      window.localStorage.setItem(GUEST_KEY, id);
    }
  } catch {
    id ??= `guest-${crypto.randomUUID()}`;
  }
  return {
    id,
    handle: "you",
    name: "You",
    avatarUrl: null,
    bio: "",
    xp: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    bestStreak: 0,
    createdAt: now().toISOString(),
  };
}

let guest: DemoBackend | null = null;

/** The X player's backend: a local engine with the guest signed in (in the browser). */
export function getGuestBackend(): Backend {
  if (!guest) {
    guest = new DemoBackend();
    if (typeof window !== "undefined") guest.adoptViewer(guestProfile());
  }
  return guest;
}
