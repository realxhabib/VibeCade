import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { env, isSupabaseConfigured } from "@/lib/env";
import { getOfficialApp } from "./catalog";
import { APP_COLUMNS, toApp, type AppRow } from "./supabase/mapping";
import type { AppManifest } from "./types";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * An app a playable post can carry (server side, for `/x/<slug>`): a first-party
 * app from the catalog, else a published community app, read as anyone (the
 * public key, no session). Null when there's no such app or the database can't say.
 */
export const getPostableApp = cache(async (slug: string): Promise<AppManifest | null> => {
  const official = getOfficialApp(slug);
  if (official) return official;
  if (!isSupabaseConfigured || !SLUG.test(slug)) return null;
  try {
    const sb = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.from("apps").select(APP_COLUMNS).eq("slug", slug).maybeSingle<AppRow>();
    // An official row the catalog no longer has is a retired first-party app.
    if (error || !data || data.official || data.status !== "published") return null;
    return toApp(data);
  } catch {
    return null;
  }
});
