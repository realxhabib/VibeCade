import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { EMBEDDED_COOKIE, sessionCookieOptions } from "./embedded";

/** Supabase client for Route Handlers and Server Components (reads/writes auth cookies). */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookieOptions: sessionCookieOptions(cookieStore.has(EMBEDDED_COOKIE)),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
