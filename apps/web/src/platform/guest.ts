import type { Backend } from "./backend";
import { DemoBackend } from "./demo/demo-backend";
import { SupabaseBackend } from "./supabase/supabase-backend";
import type { Profile } from "./types";
import { getXPlayerSupabase, hasXPlayerSession } from "./x-session";

const GUEST_KEY = "xapps:x-guest";

/**
 * The person playing inside an X post (the `/x/play` player card). X frames the
 * player on its own site, so the XApps session cookie isn't there. Until they
 * sign in through the card's popup (`x-session.ts`) they play as a guest on
 * this device, against the practice bots, on the demo backend's engine (the
 * same one offline practice uses). Storage in a frame is partitioned under
 * x.com, so none of this mixes with the site's own demo data.
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
let signedIn: SupabaseBackend | null = null;

/**
 * The X player's backend: the real one on the card's own session once it has
 * signed in, else a local engine with the guest signed in (in the browser).
 * Signing in or out reloads the card, so this is decided once per page.
 */
export function getPlayerBackend(): Backend {
  if (hasXPlayerSession()) return (signedIn ??= new SupabaseBackend(getXPlayerSupabase()));
  if (!guest) {
    guest = new DemoBackend();
    if (typeof window !== "undefined") guest.adoptViewer(guestProfile());
  }
  return guest;
}
