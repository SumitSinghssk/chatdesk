import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { NewTemplate } from "../_components/editor/EditorPages";

export const metadata: Metadata = { title: "New template" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <NewTemplate />
    </Suspense>
  );
}
