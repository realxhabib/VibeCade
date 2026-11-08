"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { AppArt } from "@/components/marketplace/app-art";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { TiltCard } from "@/components/motion/tilt-card";
import { play } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { useApps } from "@/platform/queries";
import { SPOTLIGHT, SPOTLIGHT_KIND_LABEL, SPOTLIGHT_SHOWN, spotlightDate, type SpotlightEntry } from "@/platform/spotlight";
import type { AppManifest } from "@/platform/types";
import { SectionHeading } from "./sections";

interface Shown {
  entry: SpotlightEntry;
  app?: AppManifest;
  href: string;
  accent: [string, string];
  glyph: Pick<AppManifest, "slug" | "icon" | "accent" | "name"> & Partial<Pick<AppManifest, "iconImage">>;
}

const FALLBACK_ACCENT: [string, string] = ["#8f7bff", "#ff5d8f"];

function resolve(entry: SpotlightEntry, apps: AppManifest[] | undefined): Shown | null {
  const app = entry.app ? apps?.find((a) => a.slug === entry.app) : undefined;
  // Wait for the catalog before deciding, then skip apps this deployment doesn't list.
  if (entry.app && !app) return null;
  const accent = entry.accent ?? app?.accent ?? FALLBACK_ACCENT;
  return {
    entry,
    app,
    href: entry.href ?? (app ? `/apps/${app.slug}` : "/apps"),
    accent,
    glyph: app ?? { slug: `spotlight-${entry.id}`, icon: entry.icon ?? "✨", accent, name: entry.title },
  };
}

/** "New on VibeCade": the latest games and features, edited in `platform/spotlight.ts`. */
export function Spotlight() {
  const { data: apps } = useApps();
  if (!apps) return null;
  const shown = SPOTLIGHT.map((e) => resolve(e, apps))
    .filter((s): s is Shown => !!s)
    .slice(0, SPOTLIGHT_SHOWN);
  if (shown.length === 0) return null;
  const [lead, ...rest] = shown;
  return (
    <section className="mt-16" aria-labelledby="spotlight-title">
      <SectionHeading
        eyebrow="Spotlight"
        title={<span id="spotlight-title">New on VibeCade</span>}
        action={
          <span className="hidden items-center gap-1.5 text-sm text-ink-400 sm:inline-flex">
            <Sparkles className="size-4 text-gold" /> Just shipped
          </span>
        }
      />
      <Reveal className={cn("grid grid-cols-1 gap-4", rest.length > 0 && "lg:grid-cols-5")} stagger={0.07}>
        <RevealItem className={cn(rest.length > 0 && "lg:col-span-3")}>
          <LeadCard item={lead} />
        </RevealItem>
        {rest.length > 0 && (
          <div className="flex flex-col gap-3 lg:col-span-2">
            {rest.map((item) => (
              <RevealItem key={item.entry.id} className="flex-1">
                <CompactCard item={item} />
              </RevealItem>
            ))}
          </div>
        )}
      </Reveal>
    </section>
  );
}

function Meta({ entry, className }: { entry: SpotlightEntry; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]", className)}>
      <span className="rounded-full bg-gold px-2 py-0.5 text-ink-950">New</span>
      <span className="text-ink-200">{SPOTLIGHT_KIND_LABEL[entry.kind]}</span>
      <span className="text-ink-500">·</span>
      <time dateTime={entry.date} className="text-ink-400">
        {spotlightDate(entry.date)}
      </time>
    </p>
  );
}

function LeadCard({ item }: { item: Shown }) {
  const { entry, app, href, accent, glyph } = item;
  const reduced = useReducedMotion();
  const hasCover = !!app?.coverImage;
  return (
    <Link
      href={href}
      transitionTypes={["nav-forward"]}
      onClick={() => play("pop")}
      className="group block h-full rounded-[2rem] outline-none focus-visible:ring-2 focus-visible:ring-nova-300"
    >
      <TiltCard intensity={5} className="h-full rounded-[2rem]" spotlightColor={`${accent[0]}33`}>
        <div className="relative flex h-full min-h-[26rem] flex-col justify-end overflow-hidden rounded-[2rem] border border-white/[0.08] bg-ink-850/80 transition-colors duration-500 group-hover:border-white/15 sm:min-h-96">
          {app && hasCover ? (
            <AppArt app={app} className="absolute inset-0 size-full" />
          ) : (
            <div aria-hidden className="absolute inset-0">
              <div
                className="absolute inset-0 opacity-60"
                style={{ background: `radial-gradient(120% 90% at 85% 10%, ${accent[0]}88, ${accent[1]}44 45%, transparent 75%)` }}
              />
              <motion.div
                className="absolute right-6 top-6 drop-shadow-2xl sm:right-12 sm:top-10"
                animate={reduced ? undefined : { y: [0, -8, 0], rotate: [-4, 3, -4] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <AppGlyph app={glyph} size={80} className="sm:hidden" />
                <AppGlyph app={glyph} size={112} className="max-sm:hidden" />
              </motion.div>
            </div>
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/55 to-transparent" />
          <div className="relative p-6 [transform:translateZ(40px)] sm:p-8">
            <Meta entry={entry} />
            <div className="mt-3 flex items-center gap-3">
              {app && <AppGlyph app={glyph} size={48} />}
              <h3 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{entry.title}</h3>
            </div>
            <p className="mt-3 max-w-xl text-ink-200">{entry.body}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-4 py-2 text-sm font-bold text-ink-950 transition group-hover:gap-2.5">
              {entry.cta ?? "Take a look"} <ArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </TiltCard>
    </Link>
  );
}

function CompactCard({ item }: { item: Shown }) {
  const { entry, href, accent, glyph } = item;
  return (
    <Link
      href={href}
      transitionTypes={["nav-forward"]}
      onClick={() => play("pop")}
      className="group relative flex h-full items-start gap-4 overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-ink-850/70 p-4 outline-none transition hover:border-white/15 hover:bg-ink-850 focus-visible:ring-2 focus-visible:ring-nova-300 sm:p-5"
      aria-label={`${entry.title}: ${entry.cta ?? "take a look"}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: `radial-gradient(circle, ${accent[0]}, ${accent[1]} 60%, transparent 70%)` }}
      />
      <AppGlyph app={glyph} size={48} />
      <div className="relative min-w-0 flex-1">
        <Meta entry={entry} className="text-[10px]" />
        <h3 className="mt-1.5 font-display text-lg font-extrabold leading-tight tracking-tight">{entry.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink-300">{entry.body}</p>
      </div>
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-ink-200 transition-all duration-300 group-hover:rotate-45 group-hover:bg-ink-50 group-hover:text-ink-950">
        <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}
