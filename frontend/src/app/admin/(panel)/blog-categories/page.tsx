import type { Metadata } from "next";
import { Suspense } from "react";

import BlogCategories from "./_components/BlogCategories";

export const metadata: Metadata = { title: "Blog categories" };

export default function Page() {
  return (
    <Suspense>
      <BlogCategories />
    </Suspense>
  );
}
