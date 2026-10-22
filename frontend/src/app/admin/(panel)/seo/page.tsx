import type { Metadata } from "next";
import { Suspense } from "react";

import Seo from "./_components/Seo";

export const metadata: Metadata = { title: "SEO" };

export default function Page() {
  return (
    <Suspense>
      <Seo />
    </Suspense>
  );
}
