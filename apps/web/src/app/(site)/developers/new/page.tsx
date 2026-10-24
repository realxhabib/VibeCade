import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterApp } from "@/components/pages/register-app";

export const metadata: Metadata = { title: "Register an app" };

export default function RegisterAppPage() {
  return (
    <Suspense>
      <RegisterApp />
    </Suspense>
  );
}
