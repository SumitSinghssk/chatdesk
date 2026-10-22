import type { Metadata } from "next";

import { getTeam } from "@/app/(website)/_lib/websiteApi";
import { buildMetadata } from "@/app/(website)/_lib/seo";
import { WEBSITE_ROUTES } from "@/config/routes";

import { TeamPage } from "./_components/TeamPages";

export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata(WEBSITE_ROUTES.TEAM(), {
    title: "Our team",
    description: "Meet the people behind our work.",
  });
}

export default async function Page() {
  return <TeamPage members={await getTeam()} />;
}
