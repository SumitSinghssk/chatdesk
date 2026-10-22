import type { Metadata } from "next";

import { GalleryListPage } from "./_components/GalleryPages";
import { getGalleries } from "@/app/(website)/_lib/websiteApi";
import { buildMetadata } from "@/app/(website)/_lib/seo";

import { WEBSITE_ROUTES } from "@/config/routes";
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata(WEBSITE_ROUTES.GALLERY(), {
    title: "Gallery",
    description: "Photos and videos from our events and work.",
  });
}

export default async function Page() {
  return <GalleryListPage galleries={await getGalleries()} />;
}
