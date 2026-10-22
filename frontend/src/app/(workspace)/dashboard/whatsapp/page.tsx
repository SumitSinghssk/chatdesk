import type { Metadata } from "next";

import { WhatsAppConnection } from "../_components/WhatsAppConnection";

export const metadata: Metadata = { title: "WhatsApp setup" };

export default function Page() {
  return <WhatsAppConnection />;
}
