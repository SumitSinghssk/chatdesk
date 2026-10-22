import type { Metadata } from "next";
import { Suspense } from "react";

import Team from "./_components/Team";

export const metadata: Metadata = { title: "Team members" };

export default function Page() {
  return (
    <Suspense>
      <Team />
    </Suspense>
  );
}
