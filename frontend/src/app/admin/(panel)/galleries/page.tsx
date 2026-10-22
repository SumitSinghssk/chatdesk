import type { Metadata } from "next";
import { Suspense } from "react";

import Galleries from "./_components/Galleries";

export const metadata: Metadata = { title: "Galleries" };

export default function Page() {
  return (
    <Suspense>
      <Galleries />
    </Suspense>
  );
}
