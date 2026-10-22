import type { Metadata } from "next";

import { EditCampaign } from "../../_components/builder/BuilderPages";

export const metadata: Metadata = { title: "Edit campaign" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditCampaign id={Number(id)} />;
}
