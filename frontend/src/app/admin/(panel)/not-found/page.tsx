import type { Metadata } from "next";
import { Suspense } from "react";

import NotFound from "./_components/NotFound";

export const metadata: Metadata = { title: "404 log" };

export default function Page() {
  return (
    <Suspense>
      <NotFound />
    </Suspense>
  );
}
