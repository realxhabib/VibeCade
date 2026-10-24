import { appOpengraphImage } from "@/lib/app-og-image";
import { getMatchApp } from "@/platform/postable-apps";

export const alt = "A challenge on VibeCade";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** A challenge link's card: the game's image (the generic one when the match can't be read). */
export default async function MatchOpengraphImage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return appOpengraphImage(await getMatchApp(matchId));
}
