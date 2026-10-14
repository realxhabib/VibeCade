import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PlayerCardTags } from "@/components/x/player-card-tags";
import { ShareLanding } from "@/components/x/share-landing";
import { requestOrigin, xPlayerPath, xPreviewPath, xSharePath, xSiteHandle } from "@/lib/x-player";
import { getPostableApp } from "@/platform/postable-apps";

export async function generateMetadata({ params }: PageProps<"/x/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const app = await getPostableApp(slug);
  if (!app) return {};
  return { title: { absolute: `Play ${app.name} on VibeCade` }, description: app.tagline, openGraph: null, twitter: null };
}

/** A playable post for one app: X frames `/x/play/<slug>`. People who open the link go to the app's page. */
export default async function XAppSharePage({ params }: PageProps<"/x/[slug]">) {
  const { slug } = await params;
  const app = await getPostableApp(slug);
  if (!app) notFound();
  const origin = requestOrigin(await headers());
  return (
    <>
      <PlayerCardTags
        card={{
          title: `Play ${app.name} on VibeCade`,
          description: `${app.tagline} Play it inside this post, then challenge anyone on X.`,
          url: `${origin}${xSharePath(app.slug)}`,
          player: `${origin}${xPlayerPath(app.slug)}`,
          image: `${origin}${xPreviewPath(app.slug)}`,
          imageAlt: `${app.name} on VibeCade`,
          site: xSiteHandle(),
        }}
      />
      <ShareLanding to={`/apps/${app.slug}`} app={app} />
    </>
  );
}
