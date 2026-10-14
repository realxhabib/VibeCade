import { XPlayerApp, XPlayerAppBySlug } from "@/components/x/player-app";
import { getOfficialApp } from "@/platform/catalog";

/** One app, inside the post (the player for `/x/<slug>`, and a hub tile's page). Community apps load in the browser. */
export default async function XPlayerAppPage({ params }: PageProps<"/x/play/[slug]">) {
  const { slug } = await params;
  const app = getOfficialApp(slug);
  return app ? <XPlayerApp app={app} /> : <XPlayerAppBySlug slug={slug} />;
}
