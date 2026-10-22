import type { Metadata } from "next";
import { Suspense } from "react";

import Logs from "./_components/Logs";

export const metadata: Metadata = { title: "Application logs" };

export default function Page() {
  return (
    <Suspense>
      <Logs />
    </Suspense>
  );
}
