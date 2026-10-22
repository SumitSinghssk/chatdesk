import type { Metadata } from "next";

import { ModulePage } from "../_components/ModulePage";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return <ModulePage module="templates" />;
}
