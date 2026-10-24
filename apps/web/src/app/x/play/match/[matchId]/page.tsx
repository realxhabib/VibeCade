import { XPlayerMatch } from "@/components/x/player-match";

/** A match inside the post: practice, or (signed in) a real one. */
export default async function XPlayerMatchPage({ params, searchParams }: PageProps<"/x/play/match/[matchId]">) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  return <XPlayerMatch matchId={matchId} join={query.join !== undefined} />;
}
