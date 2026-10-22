import type { Metadata } from "next";
import { Suspense } from "react";

import ActivityLogs from "./_components/ActivityLogs";

export const metadata: Metadata = { title: "Activity logs" };

export default function Page() {
  return (
    <Suspense>
      <ActivityLogs />
    </Suspense>
  );
}
