import type { Metadata } from "next";
import { Suspense } from "react";

import Profile from "./_components/Profile";

export const metadata: Metadata = { title: "My profile" };

export default function Page() {
  return (
    <Suspense>
      <Profile />
    </Suspense>
  );
}
