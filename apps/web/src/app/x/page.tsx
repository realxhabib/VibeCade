import type { Metadata } from "next";
import { headers } from "next/headers";
import { PlayerCardTags } from "@/components/x/player-card-tags";
import { ShareLanding } from "@/components/x/share-landing";
import { requestOrigin, xPlayerPath, xPreviewPath, xSharePath, xSiteHandle } from "@/lib/x-player";

const TITLE = "Play XApps right here";
const DESCRIPTION = "Reflex duels, pool, darts, mini golf and more. Play inside this post, then challenge anyone on X.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  // The player card below replaces the site's summary card.
  openGraph: null,
  twitter: null,
};

/**
 * The link to paste into a post: X reads the player card and plays the whole
 * XApps hub (`/x/play`) inside the post. People who open the link go to the site.
 */
export default async function XSharePage() {
  const origin = requestOrigin(await headers());
  return (
    <>
      <PlayerCardTags
        card={{
          title: TITLE,
          description: DESCRIPTION,
          url: `${origin}${xSharePath()}`,
          player: `${origin}${xPlayerPath()}`,
          image: `${origin}${xPreviewPath()}`,
          imageAlt: "XApps: games you can play inside this post",
          site: xSiteHandle(),
        }}
      />
      <ShareLanding to="/" />
    </>
  );
}
