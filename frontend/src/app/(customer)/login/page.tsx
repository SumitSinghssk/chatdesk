import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthPage } from "./_components/AuthPage";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense>
      <AuthPage mode="login" />
    </Suspense>
  );
}
