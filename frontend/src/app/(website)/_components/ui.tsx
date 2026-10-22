import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";

import type { BlogCard } from "@/app/(website)/_lib/websiteApi";
import { cn, formatDate } from "@/lib/utils";

import { WEBSITE_ROUTES } from "@/config/routes";
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  children?: ReactNode;
}) {
  return (
    <section className="border-line bg-page border-b">
      <Container className="py-14 sm:py-20">
        {eyebrow && <p className="text-primary text-sm font-semibold">{eyebrow}</p>}
        <h1 className="text-fg mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="text-fg-subtle mt-4 max-w-2xl text-lg">{description}</p>}
        {children}
      </Container>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <p className="text-primary text-sm font-semibold">{eyebrow}</p>}
        <h2 className="text-fg mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {description && <p className="text-fg-subtle mt-3 text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function BlogCardView({ post }: { post: BlogCard }) {
  return (
    <article className="group border-line bg-surface flex flex-col overflow-hidden rounded-2xl border shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link
        href={WEBSITE_ROUTES.BLOG_POST(post.slug)}
        className="bg-page relative block aspect-[16/9] overflow-hidden"
        tabIndex={-1}
      >
        {post.featured_image ? (
          <img
            src={post.featured_image}
            alt={post.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-indigo-50 to-violet-100 text-4xl font-bold text-indigo-300 dark:from-indigo-500/10 dark:to-violet-500/10">
            {post.title.charAt(0)}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="text-fg-subtle flex flex-wrap items-center gap-2 text-xs">
          {post.categories[0] && (
            <Link
              href={WEBSITE_ROUTES.BLOG({ category: post.categories[0].slug })}
              className="bg-primary-soft text-primary rounded-full px-2 py-0.5 font-semibold"
            >
              {post.categories[0].name}
            </Link>
          )}
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
          </span>
        </div>
        <h3 className="text-fg mt-3 text-lg leading-snug font-semibold">
          <Link href={WEBSITE_ROUTES.BLOG_POST(post.slug)} className="hover:text-primary">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && <p className="text-fg-subtle mt-2 line-clamp-3 text-sm">{post.excerpt}</p>}
        <Link
          href={WEBSITE_ROUTES.BLOG_POST(post.slug)}
          className="text-primary mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold"
        >
          Read more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}

export function Prose({ html }: { html: string | null | undefined }) {
  return (
    <div
      className="prose prose-slate dark:prose-invert prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-xl max-w-none"
      dangerouslySetInnerHTML={{ __html: html || "" }}
    />
  );
}
