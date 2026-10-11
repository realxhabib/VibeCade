import type { Metadata } from "next";
import { XAuthStart } from "@/components/x/auth-popup";

export const metadata: Metadata = { title: { absolute: "Sign in · XApps" }, robots: { index: false } };

/** The sign-in popup a playable post opens (see platform/x-session.ts). */
export default function XAuthPage() {
  return <XAuthStart />;
}
