import { redirect } from "next/navigation";
import { AppRoom } from "@/components/play/app-room";
import { XSignInButton } from "@/components/x/account";
import { xPlayerPath } from "@/lib/x-player";
import { getOfficialApp } from "@/platform/catalog";

/** A standalone app (`kind: "app"`), run inside the post. Signed out, the card's popup signs in. Community apps resolve in the browser. */
export default async function XPlayerOpenAppPage({ params }: PageProps<"/x/play/[slug]/open">) {
  const { slug } = await params;
  const app = getOfficialApp(slug);
  if (app && app.kind !== "app") redirect(xPlayerPath(slug));
  return <AppRoom slug={slug} versionId={null} signIn={<XSignInButton size="lg" />} immersive={false} />;
}
