import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Campaigns } from "./_components/Campaigns";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Campaigns />
    </Suspense>
  );
}
