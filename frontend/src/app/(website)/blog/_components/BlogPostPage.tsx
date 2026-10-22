import Link from "next/link";
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react";

import { absoluteUrl, siteConfig } from "@/config/site";
import type { BlogComments as BlogCommentsData, BlogPost } from "@/app/(website)/_lib/websiteApi";
import { formatDate } from "@/lib/utils";

import { JsonLd, PageSeo } from "@/app/(website)/_components/PageSeo";
import { BlogCardView, Container, Prose } from "@/app/(website)/_components/ui";

import { BlogComments } from "./BlogComments";

import { WEBSITE_ROUTES } from "@/config/routes";
export default function BlogPostPage({
  post,
  comments,
}: {
  post: BlogPost;
  comments: BlogCommentsData | null;
}) {
  const url = `${siteConfig.url}/blog/${post.slug}`;

  return (
    <>
      <PageSeo path={WEBSITE_ROUTES.BLOG_POST(post.slug)} />
      <JsonLd
        data={{
          "@type": "BlogPosting",
          headline: post.meta_title || post.title,
          description: post.meta_description || post.excerpt,
          image: absoluteUrl(post.featured_image),
          datePublished: post.published_at,
          dateModified: post.updated_at,
          author: post.author ? { "@type": "Person", name: post.author.name } : undefined,
          mainEntityOfPage: url,
        }}
      />
      <JsonLd
        data={{
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
            { "@type": "ListItem", position: 2, name: "Blog", item: `${siteConfig.url}/blog` },
            { "@type": "ListItem", position: 3, name: post.title, item: url },
          ],
        }}
      />

      <article>
        <header className="border-line bg-page border-b">
          <Container className="max-w-3xl py-12 sm:py-16">
            <Link
              href={WEBSITE_ROUTES.BLOG()}
              className="text-fg-subtle hover:text-primary inline-flex items-center gap-1 text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" /> All posts
            </Link>
            {post.categories.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {post.categories.map((c) => (
                  <Link
                    key={c.id}
                    href={WEBSITE_ROUTES.BLOG({ category: c.slug })}
                    className="bg-primary-soft text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
            <h1 className="text-fg mt-4 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              {post.title}
            </h1>
            {post.excerpt && <p className="text-fg-subtle mt-4 text-lg">{post.excerpt}</p>}
            <div className="text-fg-subtle mt-6 flex flex-wrap items-center gap-4 text-sm">
              {post.author && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-4 w-4" /> {post.author.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
              </span>
            </div>
          </Container>
        </header>

        <Container className="max-w-3xl py-12">
          {post.featured_image && (
            <img
              src={post.featured_image}
              alt={post.title}
              className="mb-10 aspect-[16/9] w-full rounded-2xl object-cover shadow-sm"
            />
          )}
          <Prose html={post.content} />
        </Container>
      </article>

      {comments && <BlogComments slug={post.slug} data={comments} />}

      {post.related.length > 0 && (
        <section className="border-line bg-page border-t">
          <Container className="py-16">
            <h2 className="text-fg mb-8 text-2xl font-bold tracking-tight">Related posts</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {post.related.map((p) => (
                <BlogCardView key={p.id} post={p} />
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
