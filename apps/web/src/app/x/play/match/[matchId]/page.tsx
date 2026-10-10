import { PlayRoom } from "@/components/play/play-room";

/** A guest practice match inside the post. */
export default async function XPlayerMatchPage({ params }: PageProps<"/x/play/match/[matchId]">) {
  const { matchId } = await params;
  return <PlayRoom matchId={matchId} />;
}
