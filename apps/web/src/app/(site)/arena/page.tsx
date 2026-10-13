import type { Metadata } from "next";
import { Arena } from "@/components/pages/arena";

export const metadata: Metadata = {
  title: "Arena",
  description: "Judge crowd-voted contests. Every vote earns XP.",
};

export default function ArenaPage() {
  return <Arena />;
}
