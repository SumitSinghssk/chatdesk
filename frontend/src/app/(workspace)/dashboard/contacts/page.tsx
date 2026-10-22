import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Contacts } from "./_components/Contacts";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Contacts />
    </Suspense>
  );
}
