import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Automation } from "./_components/Automation";

export const metadata: Metadata = { title: "Automation" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Automation />
    </Suspense>
  );
}
