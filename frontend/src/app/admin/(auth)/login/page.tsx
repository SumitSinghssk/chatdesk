import type { Metadata } from "next";
import { Suspense } from "react";

import LoginForm from "@/app/admin/(auth)/_components/LoginForm";
import { AuthLayout } from "@/app/admin/(auth)/_components/AuthLayout";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthLayout title="Sign in" subtitle="Sign in to your admin account to continue.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
