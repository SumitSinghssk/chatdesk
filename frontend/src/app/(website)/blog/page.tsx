import type { Metadata } from "next";

import BlogListPage from "./_components/BlogListPage";
import { buildMetadata } from "@/app/(website)/_lib/seo";

import { WEBSITE_ROUTES } from "@/config/routes";
export const revalidate = 600;

type Props = { searchParams: Promise<{ page?: string; category?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page } = await searchParams;
  const meta = await buildMetadata(WEBSITE_ROUTES.BLOG(), {
    title: "Blog",
    description: "News, guides and updates.",
  });
  return Number(page) > 1 ? { ...meta, robots: { index: false, follow: true } } : meta;
}

export default async function Page({ searchParams }: Props) {
  const { page, category } = await searchParams;
  return <BlogListPage page={Math.max(1, Number(page) || 1)} category={category} />;
}
