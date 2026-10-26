import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Commerce } from "./_components/Commerce";

export const metadata: Metadata = { title: "Commerce" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Commerce />
    </Suspense>
  );
}
