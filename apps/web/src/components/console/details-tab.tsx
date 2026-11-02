"use client";

import { motion, useReducedMotion } from "motion/react";
import { GitBranch, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/components/chrome/toasts";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { useUpdateAppDetails } from "@/platform/queries";
import { APP_DETAIL_FIELDS, detailsOf } from "@/platform/shipping";
import type { AppManifest } from "@/platform/types";
import type { ConsoleTab } from "./app-console";
import { diffManifests } from "./manifest-diff";
import { ManifestFields, formFromSide, sideFromForm, validateManifestForm, type ManifestErrors, type ManifestForm } from "./manifest-fields";
import { ManifestDiff, Panel, PanelTitle } from "./ui";
import { sideOfApp } from "./version-editor";

const DETAIL_KEYS: readonly string[] = APP_DETAIL_FIELDS;

/**
 * The console's Details tab: name, art, how-to, stats and achievements,
 * saved in place (no new version, no review). The URL and gameplay fields
 * still ship as a version.
 */
export function DetailsTab({ app, onTab }: { app: AppManifest; onTab: (tab: ConsoleTab) => void }) {
  const reduced = useReducedMotion();
  const saved = useMemo(() => sideOfApp(app), [app]);
  const [form, setForm] = useState<ManifestForm>(() => formFromSide(saved));
  const [errors, setErrors] = useState<ManifestErrors>({});
  const update = useUpdateAppDetails(app.slug);

  const side = useMemo(() => sideFromForm(form), [form]);
  const changes = diffManifests(saved, side);
  const dirty = changes.length > 0;

  const patch = (next: Partial<ManifestForm>) => {
    setForm((f) => ({ ...f, ...next }));
    setErrors((e) => {
      const copy = { ...e };
      for (const k of Object.keys(next) as (keyof ManifestForm)[]) delete copy[k];
      return copy;
    });
  };

  const reset = () => {
    setForm(formFromSide(saved));
    setErrors({});
  };

  const save = async () => {
    const all = validateManifestForm(form);
    // Only the fields on this tab can be wrong here.
    const fErr = Object.fromEntries(Object.entries(all).filter(([k]) => DETAIL_KEYS.includes(k))) as ManifestErrors;
    setErrors(fErr);
    if (Object.keys(fErr).length) {
      play("error");
      haptic("error");
      toast("Fix the highlighted fields", { tone: "danger" });
      return;
    }
    try {
      const next = await update.mutateAsync(detailsOf(side.manifest));
      setForm(formFromSide(sideOfApp(next)));
      play("pop");
      haptic("success");
      toast("Details saved", { tone: "success", description: app.status === "published" ? "Players see them now. No new version needed." : "No new version needed." });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save the details", { tone: "danger" });
    }
  };

  return (
    <motion.div initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
      <Panel>
        <PanelTitle
          sub="Name, icon and art, how-to, stats and achievements. Saving updates your listing and the live version right away, and the versions you haven't published yet. No new version or review."
        >
          Details
        </PanelTitle>
        <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-ink-300">
          <GitBranch className="size-3.5" aria-hidden />
          Changing the URL, modes, table or scoring is a new build:
          <button type="button" onClick={() => onTab("versions")} className="font-semibold text-nova-300 hover:underline">
            ship a version
          </button>
        </p>

        <div className="mt-6">
          <ManifestFields value={form} errors={errors} onChange={patch} idPrefix="details" scope="details" />
        </div>

        {dirty && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">
              Changes <span className="rounded-full bg-white/10 px-1.5 text-[11px] tabular">{changes.length}</span>
            </p>
            <ManifestDiff before={saved} after={side} beforeLabel="Now" afterLabel="After saving" />
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset} disabled={!dirty || update.isPending}>
            Reset
          </Button>
          <Button variant="accent" icon={<Save className="size-4" />} loading={update.isPending} disabled={!dirty || update.isPending} onClick={save}>
            Save details
          </Button>
        </div>
      </Panel>
    </motion.div>
  );
}
