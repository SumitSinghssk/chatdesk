import type { Metadata } from "next";

import { CampaignReport } from "../_components/CampaignReport";

export const metadata: Metadata = { title: "Campaign report" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignReport id={Number(id)} />;
}
