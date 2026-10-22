import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Team } from "./_components/Team";

export const metadata: Metadata = { title: "Team" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Team />
    </Suspense>
  );
}
