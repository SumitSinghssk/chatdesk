import type { Metadata } from "next";
import { Suspense } from "react";

import ResetPasswordForm from "@/app/admin/(auth)/_components/ResetPasswordForm";
import { AuthLayout } from "@/app/admin/(auth)/_components/AuthLayout";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your new password must be at least 8 characters."
      backToLogin
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
