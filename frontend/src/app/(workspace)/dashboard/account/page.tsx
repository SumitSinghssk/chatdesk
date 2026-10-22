import type { Metadata } from "next";

import { AccountSettings } from "../_components/AccountSettings";

export const metadata: Metadata = { title: "Account settings" };

export default function Page() {
  return <AccountSettings />;
}
