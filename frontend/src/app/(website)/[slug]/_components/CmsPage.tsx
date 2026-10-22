import type { CmsPage as CmsPageData } from "@/app/(website)/_lib/websiteApi";
import { formatDate } from "@/lib/utils";

import { PageSeo } from "@/app/(website)/_components/PageSeo";
import { Container, PageHero, Prose } from "@/app/(website)/_components/ui";

export default function CmsPage({ page }: { page: CmsPageData }) {
  return (
    <>
      <PageSeo path={`/${page.slug}`} />
      <PageHero title={page.title}>
        {page.updated_at && (
          <p className="text-fg-subtle mt-4 text-sm">Last updated {formatDate(page.updated_at)}</p>
        )}
      </PageHero>
      {page.featured_image && (
        <Container className="max-w-4xl pt-10">
          <img
            src={page.featured_image}
            alt={page.title}
            className="aspect-[21/9] w-full rounded-2xl object-cover"
          />
        </Container>
      )}
      <Container className="max-w-3xl py-12">
        <Prose html={page.content} />
      </Container>
    </>
  );
}
