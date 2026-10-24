import { appOpengraphImage } from "@/lib/app-og-image";
import { OFFICIAL_APPS } from "@/platform/catalog";
import { getPostableApp } from "@/platform/postable-apps";

export const alt = "An app on VibeCade";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return OFFICIAL_APPS.map((app) => ({ slug: app.slug }));
}

export default async function AppOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return appOpengraphImage(await getPostableApp(slug));
}
