import type { Metadata } from "next";
import { headers } from "next/headers";
import { PlayerCardTags } from "@/components/x/player-card-tags";
import { ShareLanding } from "@/components/x/share-landing";
import { requestOrigin, xMatchPlayerPath, xMatchSharePath, xPreviewPath, xSiteHandle } from "@/lib/x-player";

const TITLE = "You've been challenged on XApps";
const DESCRIPTION = "Take the seat and play right here in this post. Sign in with X to accept.";

export const metadata: Metadata = { title: { absolute: TITLE }, description: DESCRIPTION, openGraph: null, twitter: null, robots: { index: false } };

/**
 * A posted challenge (the lobby's "Post the challenge on X" link from inside a
 * playable post): X frames the match itself, so whoever sees it can sign in and
 * take the seat in the post. People who open the link go to the match on the site.
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
          player: `${origin}${xMatchPlayerPath(matchId)}`,
          image: `${origin}${xPreviewPath()}`,
          imageAlt: "A challenge on XApps",
          site: xSiteHandle(),
        }}
      />
      <ShareLanding to={`/play/${encodeURIComponent(matchId)}`} />
    </>
  );
}
