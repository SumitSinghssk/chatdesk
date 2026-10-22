import type { Metadata } from "next";

import { Overview } from "./_components/Overview";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <Overview />;
}
