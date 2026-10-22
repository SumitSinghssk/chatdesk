import type { Metadata } from "next";
import { Suspense } from "react";

import Pages from "./_components/Pages";

export const metadata: Metadata = { title: "Pages" };

export default function Page() {
  return (
    <Suspense>
      <Pages />
    </Suspense>
  );
}
