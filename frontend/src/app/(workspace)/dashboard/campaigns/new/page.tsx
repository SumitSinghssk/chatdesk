import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { NewCampaign } from "../_components/builder/BuilderPages";

export const metadata: Metadata = { title: "New campaign" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <NewCampaign />
    </Suspense>
  );
}
