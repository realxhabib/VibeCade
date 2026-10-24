"use client";

import type { ComponentProps } from "react";
import { StandingPanel as Panel, type BoardUnits } from "@/first-party/shared/standing-panel";
import { formatPct } from "./logic";
import { toneFor } from "./parts";

export type { BoardStatus } from "@/first-party/shared/standing-panel";

const FACE_UNITS: BoardUnits = {
  title: "best face",
  format: formatPct,
  tone: toneFor,
  stillCounts: "Your face still counts.",
  notYet: "Your face isn't on the board yet.",
  empty: "No faces on the board yet. Yours could be first.",
};

/** The shared standing panel, in faces. */
export function StandingPanel(props: Omit<ComponentProps<typeof Panel>, "units">) {
  return <Panel {...props} units={FACE_UNITS} />;
}
