import type { Metadata } from "next";

import { ModulePage } from "../_components/ModulePage";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return <ModulePage module="analytics" />;
}
