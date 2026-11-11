import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Calls } from "./_components/Calls";

export const metadata: Metadata = { title: "Calls" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Calls />
    </Suspense>
  );
}
