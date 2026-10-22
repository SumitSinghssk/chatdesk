import type { Metadata } from "next";
import { Suspense } from "react";

import Trash from "./_components/Trash";

export const metadata: Metadata = { title: "Trash" };

export default function Page() {
  return (
    <Suspense>
      <Trash />
    </Suspense>
  );
}
