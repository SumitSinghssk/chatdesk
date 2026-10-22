import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Templates } from "./_components/Templates";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Templates />
    </Suspense>
  );
}
