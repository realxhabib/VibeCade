/**
 * VibeCade framed by another site (Vibras plays it inline: see frame-ancestors
 * in next.config.ts). The browser gives the frame a cookie jar of its own,
 * partitioned under the top site, and only keeps cookies marked
 * `SameSite=None; Secure; Partitioned` there. So when framed, the session
 * cookies get those attributes, and a marker cookie (which exists in that
 * partition only) tells the server to write them the same way when it
 * refreshes the session. X's sign-in page won't load in a frame either, so
 * sign-in runs in a popup and hands the session back (`signInThroughPopup` in
 * platform/x-session.ts). Normal visits never see the marker and are unchanged.
 */

export const EMBEDDED_COOKIE = "vibecade-embedded";

export const EMBEDDED_COOKIE_OPTIONS = { sameSite: "none", secure: true, partitioned: true } as const;

/** Notes, in the frame's own partition, that this browser runs VibeCade framed. */
export function markEmbedded(): void {
  document.cookie = `${EMBEDDED_COOKIE}=1; Path=/; Max-Age=34560000; SameSite=None; Secure; Partitioned`;
}

/** Cookie options for the Supabase clients: partitioned when the request comes from a frame. */
export function sessionCookieOptions(embedded: boolean): typeof EMBEDDED_COOKIE_OPTIONS | undefined {
  return embedded ? EMBEDDED_COOKIE_OPTIONS : undefined;
}
