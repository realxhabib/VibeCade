import type { Metadata } from "next";
import { ViewTransition } from "react";
import { AppDetail } from "@/components/pages/app-detail";
import { OFFICIAL_APPS } from "@/platform/catalog";
import { getPostableApp } from "@/platform/postable-apps";
import { getRetiredApp } from "@/platform/retired-apps";

export function generateStaticParams() {
  return OFFICIAL_APPS.map((app) => ({ slug: app.slug }));
}

export async function generateMetadata({ params }: PageProps<"/apps/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const app = await getPostableApp(slug);
  if (!app) {
    const retired = getRetiredApp(slug);
    return { title: retired ? `${retired.name} (retired)` : "App" };
  }
  // Both objects replace the root layout's, so they repeat its card type: without
  // `summary_large_image` X shows the opengraph image as a small thumbnail.
  const title = `${app.name} on VibeCade`;
  return {
    title: app.name,
    description: `${app.tagline} Challenge anyone on X.`,
    openGraph: { type: "website", siteName: "VibeCade", title, description: app.tagline },
    twitter: { card: "summary_large_image", title, description: app.tagline },
  };
}

export default async function AppPage({ params }: PageProps<"/apps/[slug]">) {
  const { slug } = await params;
  return (
    <ViewTransition enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" }} exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }} default="none">
      <div>
        <AppDetail slug={slug} />
      </div>
    </ViewTransition>
  );
}
