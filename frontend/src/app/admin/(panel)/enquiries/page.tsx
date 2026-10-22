import type { Metadata } from "next";
import { Suspense } from "react";

import Enquiries from "./_components/Enquiries";

export const metadata: Metadata = { title: "Enquiries" };

export default function Page() {
  return (
    <Suspense>
      <Enquiries />
    </Suspense>
  );
}
