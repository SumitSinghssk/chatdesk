import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Diagrams } from "./_components/Diagrams";

export const metadata: Metadata = { title: "Diagrams" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Diagrams />
    </Suspense>
  );
}
