import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Analytics } from "./_components/Analytics";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Analytics />
    </Suspense>
  );
}
