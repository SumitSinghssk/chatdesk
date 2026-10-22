import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CmsPage from "./_components/CmsPage";
import { getPage } from "@/app/(website)/_lib/websiteApi";
import { buildMetadata } from "@/app/(website)/_lib/seo";
import { stripHtml } from "@/lib/utils";

export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page)
    return {
      title: "Page not found",
      robots: { index: false },
      alternates: { canonical: null },
      openGraph: null,
    };
  return buildMetadata(`/${slug}`, {
    title: page.meta_title || page.title,
    description: page.meta_description || stripHtml(page.content).slice(0, 160),
    image: page.featured_image,
  });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();
  return <CmsPage page={page} />;
}
