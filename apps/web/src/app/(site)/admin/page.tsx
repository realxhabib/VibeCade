import type { Metadata } from "next";
import { AdminOverviewPage } from "@/components/console/admin-overview";

export const metadata: Metadata = {
  title: "All apps",
  description: "Stats and players across every VibeCade app, for admins.",
  robots: { index: false },
};

export default function AdminPage() {
  return <AdminOverviewPage />;
}
