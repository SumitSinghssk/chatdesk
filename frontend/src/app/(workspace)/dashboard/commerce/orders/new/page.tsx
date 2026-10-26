import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { NewOrder } from "../../_components/orders/NewOrder";

export const metadata: Metadata = { title: "New order" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <NewOrder />
    </Suspense>
  );
}
