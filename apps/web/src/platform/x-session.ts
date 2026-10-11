import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * Signing in inside a playable post (the `/x/play` player card).
 *
 * X frames the card on x.com: the site's session cookie isn't sent there and
 * X's login page won't load in a frame. So the card has its own Supabase
 * session, kept in the frame's storage (partitioned under x.com, so it's this
 * card's alone), and signs in through a popup:
 *
 *  1. The card makes a random code (`newNonce`) and opens `/x/auth#n=<code>`.
 *  2. The popup signs in with X on a session of its own (never the site's
 *     cookies: two copies of one session would revoke each other's refresh
 *     tokens) and parks it with the `put_x_auth_handoff` RPC.
 *  3. The card polls `claim_x_auth_handoff` with the code and adopts the
 *     session. (The popup can't message the card: X's login page cuts it off
 *     from its opener.)
 *
 * Supabase must allow `https://<domain>/x/auth/callback` as a redirect URL.
 */

export const X_PLAYER_STORAGE_KEY = "xapps-x-player";
const POPUP_STORAGE_KEY = "xapps-x-popup";
export const POPUP_NONCE_KEY = "xapps:x-auth-nonce";
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
/** How long a sign-in may take before the card stops waiting (matches the RPC's expiry). */
export const HANDOFF_TTL_MS = 5 * 60_000;

export interface HandoffTokens {
  access_token: string;
  refresh_token: string;
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

/** The browser's storage, or an in-memory stand-in where it's blocked. */
function storage(kind: "localStorage" | "sessionStorage"): Storage {
  try {
    const s = window[kind];
    const probe = "xapps:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStorage();
  }
}

let player: SupabaseClient | null = null;

/** The card's Supabase client: its session lives in the frame's own storage, not in cookies. */
export function getXPlayerSupabase(): SupabaseClient {
  player ??= createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { storageKey: X_PLAYER_STORAGE_KEY, storage: storage("localStorage"), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return player;
}

/** Whether the card has a session stored (it runs signed in on the real backend). */
export function hasXPlayerSession(): boolean {
  if (!isSupabaseConfigured || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(X_PLAYER_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** A sign-in code: 32 random bytes, base64url. */
export function newNonce(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The code from the popup's `#n=` fragment (never sent to a server or in a referrer), if valid. */
export function nonceFromHash(hash: string): string | null {
  const n = new URLSearchParams(hash.replace(/^#/, "")).get("n");
  return n && NONCE_PATTERN.test(n) ? n : null;
}

/** The popup's client: PKCE, its session in the popup's sessionStorage (for the round trip through X only). */
export function getPopupSupabase(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { storageKey: POPUP_STORAGE_KEY, storage: storage("sessionStorage"), flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const CODE_ALPHABET = "ACDEFGHJKMNPRTUVWXY34679";

/**
 * A short code both the card and the popup show for a sign-in code. The popup
 * signs in on its own only when the card on our site opened it; when the browser
 * hides who opened it, the person confirms the codes match instead (otherwise
 * anyone could send a sign-in link for a code they made and claim the session).
 */
export function confirmCode(nonce: string): string {
  let h = 2166136261;
  for (let i = 0; i < nonce.length; i++) h = Math.imul(h ^ nonce.charCodeAt(i), 16777619) >>> 0;
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[h % CODE_ALPHABET.length];
    h = Math.floor(h / CODE_ALPHABET.length);
  }
  return code;
}

/**
 * Signing in when the card is the whole page (the X phone apps open the player
 * in their browser, unframed): no popup or hand-off, just a redirect in the same
 * tab. The card notes the code and where to come back to in this tab's
 * sessionStorage; the sign-in page trusts a code only this tab started.
 */
const SAME_TAB_KEY = "xapps:x-auth-same-tab";

export interface SameTabSignIn {
  nonce: string;
  /** The card page to come back to (a /x/play path). */
  back: string;
}

/** Only card pages on this site are places to come back to. */
export function safeBackPath(path: unknown): string {
  return typeof path === "string" && /^\/x\/play(?:[/?#]|$)/.test(path) && !path.startsWith("//") ? path : "/x/play";
}

export function rememberSameTabSignIn(signIn: SameTabSignIn): void {
  window.sessionStorage.setItem(SAME_TAB_KEY, JSON.stringify(signIn));
}

/** The same-tab sign-in this tab started for `nonce`, if any. */
export function sameTabSignIn(nonce: string | null): SameTabSignIn | null {
  if (!nonce) return null;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(SAME_TAB_KEY) ?? "null") as Partial<SameTabSignIn> | null;
    return saved && saved.nonce === nonce ? { nonce, back: safeBackPath(saved.back) } : null;
  } catch {
    return null;
  }
}

export function forgetSameTabSignIn(): void {
  try {
    window.sessionStorage.removeItem(SAME_TAB_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Whether this page runs inside a frame (the card in a post on desktop web). */
export function isFramed(win: Window = window): boolean {
  try {
    return win.top !== win;
  } catch {
    return true;
  }
}

/** Whether this popup was opened by a page on our own site (the card), as far as the browser lets us see. */
export function openedByOurSite(win: Window = window): boolean {
  try {
    return !!win.opener && win.opener !== win && win.opener.location.origin === win.location.origin;
  } catch {
    // A page on another site opened it (reading its location throws).
    return false;
  }
}

/** Forgets the popup's copy of the session once it's handed off (without revoking it: the card owns it now). */
export function clearPopupSession(): void {
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const key = window.sessionStorage.key(i);
      if (key && (key.startsWith(POPUP_STORAGE_KEY) || key === POPUP_NONCE_KEY)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Nothing stored.
  }
}

/** Checks a claim result: both tokens, as non-empty strings. */
export function toHandoffTokens(value: unknown): HandoffTokens | null {
  if (!value || typeof value !== "object") return null;
  const { access_token, refresh_token } = value as Record<string, unknown>;
  return typeof access_token === "string" && access_token && typeof refresh_token === "string" && refresh_token ? { access_token, refresh_token } : null;
}

/** The session parked under `nonce`, once the popup is done (null until then). */
export async function claimHandoff(nonce: string, client: SupabaseClient = getXPlayerSupabase()): Promise<HandoffTokens | null> {
  const { data, error } = await client.rpc("claim_x_auth_handoff", { p_nonce: nonce });
  if (error) throw error;
  return toHandoffTokens(data);
}
