import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { getBlogCategories, getBlogs } from "@/app/(website)/_lib/websiteApi";
import { cn } from "@/lib/utils";

import { PageSeo } from "@/app/(website)/_components/PageSeo";
import { BlogCardView, Container, PageHero } from "@/app/(website)/_components/ui";

import { WEBSITE_ROUTES } from "@/config/routes";
function pageHref(page: number, category?: string) {
  const sp = new URLSearchParams();
  if (category) sp.set("category", category);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? WEBSITE_ROUTES.BLOG({ "${qs": qs }) : WEBSITE_ROUTES.BLOG();
}

export default async function BlogListPage({ page, category }: { page: number; category?: string }) {
  const [result, categories] = await Promise.all([
    getBlogs({ page, per_page: 9, category }),
    getBlogCategories(),
  ]);
  const posts = result?.data ?? [];
  const meta = result?.meta;
  const current = categories.find((c) => c.slug === category);

  return (
    <>
      <PageSeo path={WEBSITE_ROUTES.BLOG()} />
      <PageHero
        eyebrow="Blog"
        title={current ? current.name : "News, guides & updates"}
        description={current?.description ?? "Insights and practical guides from our team."}
      />

      <Container className="py-12">
        {categories.length > 0 && (
          <nav aria-label="Categories" className="no-scrollbar -mx-1 mb-10 flex gap-2 overflow-x-auto px-1">
            {[{ slug: undefined, name: "All posts" }, ...categories.filter((c) => c.posts_count > 0)].map(
              (c) => {
                const active = c.slug === category;
                return (
                  <Link
                    key={c.slug ?? "all"}
                    href={pageHref(1, c.slug)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition",
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg"
                    )}
                  >
                    {c.name}
                  </Link>
                );
              }
            )}
          </nav>
        )}

        {posts.length === 0 ? (
          <div className="border-line-strong rounded-2xl border border-dashed py-20 text-center">
            <p className="text-fg text-lg font-semibold">No posts yet</p>
            <p className="text-fg-subtle mt-1">Check back soon — we&apos;re writing something good.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <BlogCardView key={post.id} post={post} />
            ))}
          </div>
        )}

        {meta && meta.total_pages > 1 && (
          <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-2">
            {meta.page > 1 && (
              <Link
                href={pageHref(meta.page - 1, category)}
                rel="prev"
                className="border-line hover:bg-page inline-flex h-10 items-center gap-1 rounded-lg border px-4 text-sm font-medium"
              >
                <ChevronLeft className="h-4 w-4" /> Newer
              </Link>
            )}
            <span className="text-fg-subtle px-3 text-sm">
              Page {meta.page} of {meta.total_pages}
            </span>
            {meta.page < meta.total_pages && (
              <Link
                href={pageHref(meta.page + 1, category)}
                rel="next"
                className="border-line hover:bg-page inline-flex h-10 items-center gap-1 rounded-lg border px-4 text-sm font-medium"
              >
                Older <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </nav>
        )}
      </Container>
    </>
  );
}
