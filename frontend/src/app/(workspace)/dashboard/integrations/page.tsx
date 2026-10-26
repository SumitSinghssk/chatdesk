import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Integrations } from "./_components/Integrations";

export const metadata: Metadata = { title: "Integrations" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Integrations />
    </Suspense>
  );
}
