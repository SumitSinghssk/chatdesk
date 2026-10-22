import type { Metadata } from "next";
import { Suspense } from "react";

import Comments from "./_components/Comments";

export const metadata: Metadata = { title: "Comments" };

export default function Page() {
  return (
    <Suspense>
      <Comments />
    </Suspense>
  );
}
