import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { AccountSettings } from "../_components/AccountSettings";

export const metadata: Metadata = { title: "Account settings" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <AccountSettings />
    </Suspense>
  );
}
