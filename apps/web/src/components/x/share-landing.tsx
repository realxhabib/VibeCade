"use client";

import { useEffect } from "react";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { LogoMark } from "@/components/chrome/logo";
import type { AppManifest } from "@/platform/types";

/**
 * What a person (not X's crawler, which only reads the tags) sees on a share
 * link: the mobile apps open it in a browser, so send them straight on to the
 * full site, where they can sign in with X and challenge people.
 */
export function ShareLanding({ to, app }: { to: string; app?: Pick<AppManifest, "slug" | "icon" | "accent" | "name"> }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
      {app ? <AppGlyph app={app} size={72} /> : <LogoMark size={56} />}
      <p className="text-ink-200">Opening {app ? app.name : "XApps"}…</p>
      <a href={to} className="rounded-full bg-ink-50 px-5 py-2.5 text-sm font-semibold text-ink-950">
        Continue
      </a>
    </main>
  );
}
