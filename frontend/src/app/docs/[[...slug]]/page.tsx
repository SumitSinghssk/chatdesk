import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { pageBySlug, PAGES } from "../_content";
import { DocArticle } from "../_components/DocArticle";

type Props = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return PAGES.map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = pageBySlug(((await params).slug ?? []).join("/"));
  if (!page) return {};
  return {
    title: page.slug ? page.title : { absolute: "ChatDesk developer docs" },
    description: page.description,
  };
}

export default async function Page({ params }: Props) {
  const slug = ((await params).slug ?? []).join("/");
  if (!pageBySlug(slug)) notFound();
  return <DocArticle slug={slug} />;
}
