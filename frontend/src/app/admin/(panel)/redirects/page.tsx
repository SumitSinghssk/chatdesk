import type { Metadata } from "next";
import { Suspense } from "react";

import Redirects from "./_components/Redirects";

export const metadata: Metadata = { title: "Redirects" };

export default function Page() {
  return (
    <Suspense>
      <Redirects />
    </Suspense>
  );
}
