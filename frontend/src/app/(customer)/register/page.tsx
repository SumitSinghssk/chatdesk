import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthPage } from "@/app/(customer)/login/_components/AuthPage";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <Suspense>
      <AuthPage mode="register" />
    </Suspense>
  );
}
