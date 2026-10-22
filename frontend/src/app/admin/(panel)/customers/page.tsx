import type { Metadata } from "next";
import { Suspense } from "react";

import Customers from "./_components/Customers";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return (
    <Suspense>
      <Customers />
    </Suspense>
  );
}
