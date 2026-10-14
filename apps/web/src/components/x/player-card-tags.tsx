import { playerCardTags, type PlayerCard } from "@/lib/x-player";

/**
 * A playable post's card. Written as plain tags (React hoists them into the
 * head) because Next's `twitter.players` always adds `twitter:player:stream`,
 * which is for raw video and would point X at an HTML page.
 */
export function PlayerCardTags({ card }: { card: PlayerCard }) {
  return playerCardTags(card).map((tag) =>
    tag.property ? <meta key={tag.property} property={tag.property} content={tag.content} /> : <meta key={tag.name} name={tag.name} content={tag.content} />,
  );
}
