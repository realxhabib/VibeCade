import type { Metadata } from "next";
import { headers } from "next/headers";
import { PlayerCardTags } from "@/components/x/player-card-tags";
import { ShareLanding } from "@/components/x/share-landing";
import { requestOrigin, xMatchPlayerPath, xMatchSharePath, xPreviewPath, xSiteHandle } from "@/lib/x-player";

const TITLE = "You've been challenged on VibeCade";
const DESCRIPTION = "Take the seat and play right here in this post. Sign in with X to accept.";

export const metadata: Metadata = { title: { absolute: TITLE }, description: DESCRIPTION, openGraph: null, twitter: null, robots: { index: false } };

/**
 * A posted challenge (the lobby's "Post the challenge on X" link from inside a
 * playable post): X frames the match itself, so whoever sees it can sign in and
 * take the seat in the post. People who open the link (the X phone apps do) get the same player, full screen.
 */
export default async function XMatchSharePage({ params }: PageProps<"/x/m/[matchId]">) {
  const { matchId } = await params;
  const origin = requestOrigin(await headers());
  return (
    <>
      <PlayerCardTags
        card={{
          title: TITLE,
          description: DESCRIPTION,
          url: `${origin}${xMatchSharePath(matchId)}`,
          player: `${origin}${xMatchPlayerPath(matchId, true)}`,
          image: `${origin}${xPreviewPath()}`,
          imageAlt: "A challenge on VibeCade",
          site: xSiteHandle(),
        }}
      />
      <ShareLanding to={xMatchPlayerPath(matchId, true)} />
    </>
  );
}
