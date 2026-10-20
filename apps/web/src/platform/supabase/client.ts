import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { isFramed } from "@/platform/x-session";
import { markEmbedded, sessionCookieOptions } from "./embedded";

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    // Framed by another site: partitioned session cookies (see ./embedded.ts).
    const embedded = isFramed();
    if (embedded) markEmbedded();
    client = createBrowserClient(env.supabaseUrl, env.supabaseKey, { cookieOptions: sessionCookieOptions(embedded) });
  }
  return client;
}
