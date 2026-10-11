import type { Metadata } from "next";
import { XAuthCallback } from "@/components/x/auth-popup";

export const metadata: Metadata = { title: { absolute: "Sign in · XApps" }, robots: { index: false } };

/** Where X sends the sign-in popup back to (add it to Supabase's redirect URLs). */
export default function XAuthCallbackPage() {
  return <XAuthCallback />;
}
