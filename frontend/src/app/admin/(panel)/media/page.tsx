import type { Metadata } from "next";
import { Suspense } from "react";

import MediaLibrary from "./_components/MediaLibrary";

export const metadata: Metadata = { title: "Media library" };

export default function Page() {
  return (
    <Suspense>
      <MediaLibrary />
    </Suspense>
  );
}
