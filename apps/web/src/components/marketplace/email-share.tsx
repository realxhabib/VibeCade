"use client";

import { motion } from "motion/react";
import { Mail } from "lucide-react";
import { toast } from "@/components/chrome/toasts";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { useViewer } from "@/platform/client";
import { useEmailSharing, useSetEmailSharing } from "@/platform/queries";
import type { AppManifest } from "@/platform/types";

/** Opt in to sharing your sign-in email with an app's developer (off until the player turns it on). */
export function EmailShare({ app, className }: { app: AppManifest; className?: string }) {
  const { viewer } = useViewer();
  const { data: on = false, isLoading } = useEmailSharing(app.slug, !!viewer);
  const set = useSetEmailSharing(app.slug);
  // The viewer lives in the browser (demo) or a cookie session: render after mount.
  const mounted = useMounted();
  if (!mounted || !viewer || viewer.id === app.developer.id) return null;
  const who = app.official ? "VibeCade Studio" : `@${app.developer.handle}`;

  const toggle = async () => {
    try {
      const next = await set.mutateAsync(!on);
      play(next ? "pop" : "tick");
      toast(next ? `${who} can see your email` : `Stopped sharing your email with ${who}`, { tone: next ? "success" : "info" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't change that", { tone: "danger" });
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      disabled={isLoading || set.isPending}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-60",
        on ? "border-white/30 bg-white/[0.07]" : "border-white/10 hover:border-white/20",
        className,
      )}
    >
      <Mail className="size-4 shrink-0 text-ink-300" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Share my email with {who}</span>
        <span className="block text-xs text-ink-400">For news and updates about {app.name}. Turn it off any time.</span>
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-volt" : "bg-white/15")}>
        <motion.span className="absolute top-0.5 size-4 rounded-full bg-white shadow" animate={{ left: on ? 18 : 2 }} transition={spring.snappy} />
      </span>
    </button>
  );
}
