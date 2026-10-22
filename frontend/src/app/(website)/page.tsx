import type { Metadata } from "next";

import HomePage from "./_components/HomePage";
import { buildMetadata } from "./_lib/seo";

export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/");
}

export default function Page() {
  return <HomePage />;
}
