import type { Metadata } from "next";

import { AcceptInvite } from "./_components/AcceptInvite";

export const metadata: Metadata = { title: "Join your team" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvite token={token} />;
}
