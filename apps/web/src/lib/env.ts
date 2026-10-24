/**
 * Public configuration. `NEXT_PUBLIC_*` values are inlined at build time, so
 * these are safe to read anywhere.
 */
export const env = {
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""),
  // `||`, not `??`: a blank PUBLISHABLE_KEY line (as in .env.example) must not hide the anon key.
  supabaseKey: (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
  /**
   * The XApps live server (the arcade server on the droplet) for fast games' match rooms, e.g.
   * https://174-138-34-59.sslip.io. Unset: every game uses Supabase Realtime.
   */
  liveServerUrl: (process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "").trim().replace(/\/+$/, ""),
  /** Force `x` (OAuth 2.0) or `twitter` (legacy OAuth 1.0a). Unset: detect which one is enabled. */
  xProvider: (["x", "twitter"] as const).find((p) => p === process.env.NEXT_PUBLIC_SUPABASE_X_PROVIDER) ?? null,
};

/** Without Supabase keys the app runs in local demo mode. */
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseKey);
