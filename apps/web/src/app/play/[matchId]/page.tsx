import type { Metadata } from "next";
import { PlayRoom } from "@/components/play/play-room";
import { getMatchApp } from "@/platform/postable-apps";

const DESCRIPTION = "You've been challenged on VibeCade. Accept and play head-to-head.";

export async function generateMetadata({ params }: PageProps<"/play/[matchId]">): Promise<Metadata> {
  const { matchId } = await params;
  const app = await getMatchApp(matchId);
  if (!app) return { title: "Match", description: DESCRIPTION };
  // Both objects replace the root layout's, so they repeat its card type (see /apps/[slug]).
  const title = `${app.name} challenge on VibeCade`;
  const description = `You've been challenged to ${app.name}. Accept and play head-to-head.`;
  return {
    title: `${app.name} challenge`,
    description,
    openGraph: { type: "website", siteName: "VibeCade", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PlayPage({ params, searchParams }: PageProps<"/play/[matchId]">) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  return <PlayRoom matchId={matchId} join={query.join !== undefined} />;
}
