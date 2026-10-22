import type { Metadata } from "next";
import { Suspense } from "react";

import Testimonials from "./_components/Testimonials";

export const metadata: Metadata = { title: "Testimonials" };

export default function Page() {
  return (
    <Suspense>
      <Testimonials />
    </Suspense>
  );
}
