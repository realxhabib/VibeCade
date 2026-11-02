"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FlaskConical, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "@/components/chrome/toasts";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { EDITABLE_STATUSES } from "@/platform/shipping";
import { useSubmitVersion } from "@/platform/queries";
import type { AppManifest, AppVersion } from "@/platform/types";
import { ConfirmDialog } from "./confirm";
import { compareSemver } from "./semver";
import { ManifestDiff } from "./ui";
import { sideOf } from "./version-editor";

/**
 * The build you're testing and could send to review: the newest draft (or
 * rejected) version above the live one, while nothing else is in review.
 */
export function testingVersion(versions: AppVersion[]): AppVersion | null {
  if (versions.some((v) => v.status === "in_review" || v.status === "approved")) return null;
  const live = versions.find((v) => v.status === "published") ?? null;
  const newest = [...versions].sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;
  if (!newest || !EDITABLE_STATUSES.includes(newest.status)) return null;
  if (live && compareSemver(newest.version, live.version) <= 0) return null;
  return newest;
}

/** The console header's "Submit for review" strip, on every tab, while a build is being tested. */
export function SubmitForReviewButton({ app, versions, className }: { app: AppManifest; versions: AppVersion[]; className?: string }) {
  const reduced = useReducedMotion();
  const candidate = testingVersion(versions);
  const live = versions.find((v) => v.status === "published") ?? null;
  const submit = useSubmitVersion(app.slug);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const run = async () => {
    if (!candidate) return;
    try {
      await submit.mutateAsync(candidate.id);
      play("whoosh");
      haptic("success");
      toast(`v${candidate.version} sent for review`, { tone: "success", description: "You and your testers can keep playing it while you wait." });
      setOpen(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't submit", { tone: "danger" });
    }
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {candidate && (
          <motion.div
            key={candidate.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.soft}
            className={cn("flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:flex-row sm:items-center", className)}
          >
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-200">
              <FlaskConical className="size-4 shrink-0 text-volt" aria-hidden />
              <span>
                {candidate.status === "rejected" ? (
                  <>
                    <b className="font-mono">v{candidate.version}</b> had changes requested. Resubmit when it&apos;s fixed.
                  </>
                ) : (
                  <>
                    Testing <b className="font-mono">v{candidate.version}</b>. Send it for review when it&apos;s ready{app.status === "published" ? "" : " to get listed"}.
                  </>
                )}
              </span>
            </p>
            <Button size="sm" variant="accent" icon={<Send className="size-3.5" />} onClick={() => setOpen(true)}>
              {candidate.status === "rejected" ? "Resubmit" : "Submit for review"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={open && !!candidate}
        onClose={close}
        busy={submit.isPending}
        onConfirm={run}
        icon={<Send className="size-4" />}
        title={`Submit v${candidate?.version ?? ""} for review?`}
        description="A reviewer checks the build and the listing. You and your testers can keep playing it meanwhile."
        confirmLabel="Submit"
      >
        {candidate && (
          <div className="max-h-[40dvh] overflow-y-auto">
            <ManifestDiff before={live ? sideOf(live) : null} after={sideOf(candidate)} beforeLabel={live ? `v${live.version}` : "Published"} afterLabel={`v${candidate.version}`} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
