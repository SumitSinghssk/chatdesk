import type { Metadata } from "next";
import { Suspense } from "react";

import ForgotPasswordForm from "@/app/admin/(auth)/_components/ForgotPasswordForm";
import { AuthLayout } from "@/app/admin/(auth)/_components/AuthLayout";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      backToLogin
    >
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
