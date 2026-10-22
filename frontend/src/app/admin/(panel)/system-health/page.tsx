import type { Metadata } from "next";
import { Suspense } from "react";

import SystemHealth from "./_components/SystemHealth";

export const metadata: Metadata = { title: "System health" };

export default function Page() {
  return (
    <Suspense>
      <SystemHealth />
    </Suspense>
  );
}
