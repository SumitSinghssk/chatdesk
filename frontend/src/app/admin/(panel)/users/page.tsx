import type { Metadata } from "next";
import { Suspense } from "react";

import Users from "./_components/Users";

export const metadata: Metadata = { title: "Users" };

export default function Page() {
  return (
    <Suspense>
      <Users />
    </Suspense>
  );
}
