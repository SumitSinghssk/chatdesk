import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BlogPostPage from "@/app/(website)/blog/_components/BlogPostPage";
import { getBlog, getBlogComments } from "@/app/(website)/_lib/websiteApi";
import { buildMetadata } from "@/app/(website)/_lib/seo";

import { WEBSITE_ROUTES } from "@/config/routes";
export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlog(slug);
  if (!post)
    return {
      title: "Post not found",
      robots: { index: false },
      alternates: { canonical: null },
      openGraph: null,
    };
  return buildMetadata(WEBSITE_ROUTES.BLOG_POST(slug), {
    title: post.meta_title || post.title,
    description: post.meta_description || post.excerpt,
    image: post.featured_image,
    type: "article",
    publishedTime: post.published_at,
    modifiedTime: post.updated_at,
  });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const post = await getBlog(slug);
  if (!post) notFound();
  const comments = await getBlogComments(slug);
  return <BlogPostPage post={post} comments={comments} />;
}
