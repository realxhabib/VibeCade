"use client";

import { StarshipFlap } from "@/first-party/starship-flap/app";
import { EmbedRoot } from "@/first-party/shared/embed-root";

/** A standalone app: opened directly, the mock host runs it in app mode (you alone, no match). */
export default function StarshipFlapEmbed() {
  return (
    <EmbedRoot slug="starship-flap" purpose="app">
      <StarshipFlap />
    </EmbedRoot>
  );
}
