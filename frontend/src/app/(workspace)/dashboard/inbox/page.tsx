import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Inbox } from "./_components/Inbox";

export const metadata: Metadata = { title: "Team inbox" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Inbox />
    </Suspense>
  );
}
