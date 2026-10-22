import type { Metadata } from "next";

import { ModulePage } from "../_components/ModulePage";

export const metadata: Metadata = { title: "AI agent" };

export default function Page() {
  return <ModulePage module="ai-agent" />;
}
