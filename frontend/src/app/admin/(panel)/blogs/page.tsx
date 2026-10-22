import type { Metadata } from "next";
import { Suspense } from "react";

import Blogs from "./_components/Blogs";

export const metadata: Metadata = { title: "Blog posts" };

export default function Page() {
  return (
    <Suspense>
      <Blogs />
    </Suspense>
  );
}
