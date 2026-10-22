import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GalleryDetailPage } from "@/app/(website)/gallery/_components/GalleryPages";
import { getGallery } from "@/app/(website)/_lib/websiteApi";
import { buildMetadata } from "@/app/(website)/_lib/seo";

import { WEBSITE_ROUTES } from "@/config/routes";
export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const gallery = await getGallery(slug);
  if (!gallery)
    return {
      title: "Album not found",
      robots: { index: false },
      alternates: { canonical: null },
      openGraph: null,
    };
  return buildMetadata(WEBSITE_ROUTES.GALLERY_ITEM(slug), {
    title: gallery.title,
    description: gallery.description,
    image: gallery.cover_image,
  });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const gallery = await getGallery(slug);
  if (!gallery) notFound();
  return <GalleryDetailPage gallery={gallery} />;
}
