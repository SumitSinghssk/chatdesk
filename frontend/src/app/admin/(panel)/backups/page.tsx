import type { Metadata } from "next";
import { Suspense } from "react";

import Backups from "./_components/Backups";

export const metadata: Metadata = { title: "Backups" };

export default function Page() {
  return (
    <Suspense>
      <Backups />
    </Suspense>
  );
}
