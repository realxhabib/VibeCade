"use client";

import { StarshipFlap } from "@/first-party/starship-flap/app";
import { EmbedRoot } from "@/first-party/shared/embed-root";

export default function StarshipFlapEmbed() {
  return (
    <EmbedRoot slug="starship-flap">
      <StarshipFlap />
    </EmbedRoot>
  );
}
