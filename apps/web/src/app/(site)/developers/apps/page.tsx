import type { Metadata } from "next";
import { ConsoleHome } from "@/components/console/console-home";

export const metadata: Metadata = {
  title: "Your apps",
  description: "Every app you've registered on VibeCade, with its versions.",
  robots: { index: false },
};

export default function ConsoleHomePage() {
  return <ConsoleHome />;
}
