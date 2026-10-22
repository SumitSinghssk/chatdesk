import type { Metadata } from "next";

import { ModulePage } from "../_components/ModulePage";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return <ModulePage module="contacts" />;
}
