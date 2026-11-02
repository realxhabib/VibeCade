"use client";

import dynamic from "next/dynamic";
import { useVibeCade } from "vibecade-sdk/react";
import { EmbedRoot } from "@/first-party/shared/embed-root";
import { FrontlineLoading } from "@/first-party/frontline/loading";

// three.js only ever loads here.
const FrontlineApp = dynamic(() => import("@/first-party/frontline/app").then((m) => m.FrontlineApp), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full">
      <FrontlineLoading />
    </div>
  ),
});

// The challenge setup form (time limit, kill limit, season) needs none of the game.
const FrontlineSetup = dynamic(() => import("@/first-party/frontline/setup").then((m) => m.FrontlineSetup), { ssr: false });

function Frontline() {
  const xapps = useVibeCade();
  return xapps.purpose === "setup" ? <FrontlineSetup /> : <FrontlineApp />;
}

export default function FrontlinePage() {
  return (
    <EmbedRoot slug="frontline">
      <Frontline />
    </EmbedRoot>
  );
}
