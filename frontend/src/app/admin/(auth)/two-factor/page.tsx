import type { Metadata } from "next";
import { Suspense } from "react";

import TwoFactorForm from "@/app/admin/(auth)/_components/TwoFactorForm";
import { AuthLayout } from "@/app/admin/(auth)/_components/AuthLayout";

export const metadata: Metadata = { title: "Two-factor verification" };

export default function Page() {
  return (
    <AuthLayout title="Two-factor verification" subtitle="One more step to confirm it's you." backToLogin>
      <Suspense>
        <TwoFactorForm />
      </Suspense>
    </AuthLayout>
  );
}
