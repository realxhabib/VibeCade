import { notFound } from "next/navigation";
import { XPlayerApp } from "@/components/x/player-app";
import { getOfficialApp } from "@/platform/catalog";

/** One app, inside the post (the player for `/x/<slug>`, and a hub tile's page). */
export default async function XPlayerAppPage({ params }: PageProps<"/x/play/[slug]">) {
  const { slug } = await params;
  const app = getOfficialApp(slug);
  if (!app) notFound();
  return <XPlayerApp app={app} />;
}
