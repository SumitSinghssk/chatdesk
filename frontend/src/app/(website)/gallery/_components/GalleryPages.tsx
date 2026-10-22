import Link from "next/link";
import { ArrowLeft, CalendarDays, Images } from "lucide-react";

import type { GalleryCard, GalleryDetail } from "@/app/(website)/_lib/websiteApi";
import { formatDate } from "@/lib/utils";

import { PageSeo } from "@/app/(website)/_components/PageSeo";
import { Container, PageHero } from "@/app/(website)/_components/ui";
import { GalleryGrid } from "./GalleryGrid";

import { WEBSITE_ROUTES } from "@/config/routes";
export function GalleryListPage({ galleries }: { galleries: GalleryCard[] }) {
  return (
    <>
      <PageSeo path={WEBSITE_ROUTES.GALLERY()} />
      <PageHero
        eyebrow="Gallery"
        title="Moments & memories"
        description="Photos and videos from our events and work."
      />
      <Container className="py-12">
        {galleries.length === 0 ? (
          <p className="text-fg-subtle py-20 text-center">No albums yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {galleries.map((g) => (
              <Link
                key={g.id}
                href={WEBSITE_ROUTES.GALLERY_ITEM(g.slug)}
                className="group border-line bg-surface overflow-hidden rounded-2xl border shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="bg-page aspect-[4/3] overflow-hidden">
                  {g.cover_image ? (
                    <img
                      src={g.cover_image}
                      alt={g.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="text-fg-faint flex h-full items-center justify-center">
                      <Images className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h2 className="text-fg group-hover:text-primary text-lg font-semibold">{g.title}</h2>
                  <p className="text-fg-subtle mt-1 flex items-center gap-3 text-sm">
                    <span>{g.items_count} items</span>
                    {g.event_date && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDate(g.event_date)}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}

export function GalleryDetailPage({ gallery }: { gallery: GalleryDetail }) {
  return (
    <>
      <PageSeo path={WEBSITE_ROUTES.GALLERY_ITEM(gallery.slug)} />
      <PageHero
        eyebrow={gallery.event_date ? formatDate(gallery.event_date) : "Gallery"}
        title={gallery.title}
        description={gallery.description}
      >
        <Link
          href={WEBSITE_ROUTES.GALLERY()}
          className="text-fg-subtle hover:text-primary mt-6 inline-flex items-center gap-1 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> All albums
        </Link>
      </PageHero>
      <Container className="py-12">
        {gallery.items.length === 0 ? (
          <p className="text-fg-subtle py-20 text-center">This album is empty.</p>
        ) : (
          <GalleryGrid items={gallery.items} title={gallery.title} />
        )}
      </Container>
    </>
  );
}
