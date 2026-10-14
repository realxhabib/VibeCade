/**
 * Greg's Face — where your best face ranks worldwide: the shared standing
 * helpers (`shared/standing`) on the `best_face` stat.
 */
import type { StatStanding } from "vibecade-sdk";
import { cleanStanding as cleanFor } from "@/first-party/shared/standing";

export { BOARD_TOP, formatCount, percentLabel, standingMoments, topPercent, type Moments } from "@/first-party/shared/standing";

/** The stat the global board ranks (aggregate `max`). */
export const BOARD_STAT = "best_face";

export function cleanStanding(raw: unknown): StatStanding | null {
  return cleanFor(raw, BOARD_STAT);
}
