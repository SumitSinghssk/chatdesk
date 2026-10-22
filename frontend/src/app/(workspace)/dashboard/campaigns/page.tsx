import type { Metadata } from "next";

import { ModulePage } from "../_components/ModulePage";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  return <ModulePage module="campaigns" />;
}
