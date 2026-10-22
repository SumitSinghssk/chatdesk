import type { Metadata } from "next";
import { Suspense } from "react";

import Roles from "./_components/Roles";

export const metadata: Metadata = { title: "Roles & permissions" };

export default function Page() {
  return (
    <Suspense>
      <Roles />
    </Suspense>
  );
}
