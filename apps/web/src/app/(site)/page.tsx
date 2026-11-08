import { ViewTransition } from "react";
import { Hero } from "@/components/home/hero";
import { Spotlight } from "@/components/home/spotlight";
import { ArenaTeaser, BuildTeaser, FeaturedApps, HowItWorks, LiveTicker, YourMove } from "@/components/home/sections";

export default function HomePage() {
  return (
    <ViewTransition enter={{ "nav-back": "nav-back", default: "page-fade" }} exit={{ "nav-forward": "nav-forward", default: "none" }} default="none">
      <div>
        <Hero />
        <LiveTicker />
        <YourMove />
        <Spotlight />
        <FeaturedApps />
        <ArenaTeaser />
        <HowItWorks />
        <BuildTeaser />
      </div>
    </ViewTransition>
  );
}
