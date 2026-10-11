import { XPlayerMatch } from "@/components/x/player-match";

/** A match inside the post: practice, or (signed in) a real one. */
export default async function XPlayerMatchPage({ params }: PageProps<"/x/play/match/[matchId]">) {
  const { matchId } = await params;
  return <XPlayerMatch matchId={matchId} />;
}
