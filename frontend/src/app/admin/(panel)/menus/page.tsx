import type { Metadata } from "next";
import { Suspense } from "react";

import Menus from "./_components/Menus";

export const metadata: Metadata = { title: "Menus" };

export default function Page() {
  return (
    <Suspense>
      <Menus />
    </Suspense>
  );
}
