import type { Metadata } from "next";
import { Developers } from "@/components/pages/developers";

export const metadata: Metadata = {
  title: "Build on Vibecade",
  description: "The Vibecade SDK: X identity, realtime rooms, matchmaking, crowd judging and host UI for head-to-head apps.",
};

export default function DevelopersPage() {
  return <Developers />;
}
