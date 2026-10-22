"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Map,
  Newspaper,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { siteConfig } from "@/config/site";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  FilterSelect,
  ListToolbar,
  StatCard,
  type BadgeTone,
  type Column,
} from "@/app/admin/_components/ui/index";
import api from "@/app/admin/_lib/api/client";
import { WEBSITE_ENDPOINTS } from "@/config/endpoints/website";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import type { ApiResponse } from "@/app/admin/_lib/api/types";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { WEBSITE_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
type EntryType = "static" | "page" | "blog" | "gallery";

interface Entry {
  id: number;
  path: string;
  lastmod: string | null;
  type: EntryType;
}

const STATIC_PATHS = new Set([
  "/",
  WEBSITE_ROUTES.BLOG(),
  WEBSITE_ROUTES.GALLERY(),
  WEBSITE_ROUTES.CONTACT(),
]);

const TYPE_META: Record<EntryType, { label: string; tone: BadgeTone }> = {
  static: { label: "Static", tone: "neutral" },
  page: { label: "Page", tone: "info" },
  blog: { label: "Blog post", tone: "brand" },
  gallery: { label: "Gallery", tone: "success" },
};

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "page", label: "Pages" },
  { value: "blog", label: "Blog posts" },
  { value: "gallery", label: "Galleries" },
];

const typeOf = (path: string): EntryType =>
  STATIC_PATHS.has(path)
    ? "static"
    : path.startsWith(`${WEBSITE_ROUTES.BLOG.path}/`)
      ? "blog"
      : path.startsWith(`${WEBSITE_ROUTES.GALLERY.path}/`)
        ? "gallery"
        : "page";

const SITEMAP_URL = `${siteConfig.url}/sitemap.xml`;
const SEARCH_CONSOLE_URL = "https://search.google.com/search-console/sitemaps";

export function SitemapTab({ canEdit: _canEdit }: { canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<EntryType | "all">("all");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [QK.SETTINGS, "sitemap"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ path: string; lastmod: string | null }[]>>(
        WEBSITE_ENDPOINTS.SITEMAP
      );
      return res.data.data.map((e, i): Entry => ({ ...e, id: i + 1, type: typeOf(e.path) }));
    },
  });

  const counts = useMemo(() => {
    const c: Record<EntryType, number> = { static: 0, page: 0, blog: 0, gallery: 0 };
    for (const e of data ?? []) c[e.type] += 1;
    return c;
  }, [data]);

  const newest = useMemo(
    () =>
      (data ?? [])
        .map((e) => e.lastmod)
        .filter((v): v is string => !!v)
        .sort()
        .at(-1) ?? null,
    [data]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesType = (e: Entry) =>
      type === "all" || e.type === type || (type === "page" && e.type === "static");
    return (data ?? []).filter((e) => matchesType(e) && (!q || e.path.toLowerCase().includes(q)));
  }, [data, search, type]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SITEMAP_URL);
      toast.success("Sitemap address copied");
    } catch {
      toast.error("Couldn't copy. Select the address and copy it yourself.");
    }
  };

  const columns: Column<Entry>[] = [
    {
      key: "path",
      header: "Address",
      cell: (e) => (
        <a
          href={`${siteConfig.url}${e.path}`}
          target="_blank"
          rel="noreferrer"
          className="text-fg hover:text-primary font-mono text-xs break-all hover:underline"
        >
          {e.path}
        </a>
      ),
    },
    {
      key: "type",
      header: "Type",
      hideOnMobile: true,
      cell: (e) => <Badge tone={TYPE_META[e.type].tone}>{TYPE_META[e.type].label}</Badge>,
    },
    {
      key: "lastmod",
      header: "Last modified",
      cell: (e) =>
        e.lastmod ? (
          <span className="text-fg-muted text-sm" title={formatDateTime(e.lastmod)}>
            {timeAgo(e.lastmod)}
          </span>
        ) : (
          <span className="text-fg-subtle text-sm">—</span>
        ),
    },
  ];

  const toggle = (t: EntryType) => setType((cur) => (cur === t ? "all" : t));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={Map}
          title="Sitemap status"
          description="Overview of the sitemap.xml file search engines read."
          actions={
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              leftIcon={RefreshCw}
              aria-label="Refresh"
              title="Refresh"
              loading={isFetching}
              onClick={() => refetch()}
            />
          }
        />
        <CardBody className="space-y-4">
          <p className="text-fg-muted text-sm">
            The sitemap is generated automatically from your published pages, blog posts and galleries, so it
            is always up to date. Search engines refresh it every few minutes; there is nothing to upload.
          </p>
          <div className="border-line bg-page flex flex-wrap items-center gap-2 rounded-lg border p-2 pl-3">
            <Globe className="text-fg-subtle h-4 w-4 shrink-0" aria-hidden />
            <code className="text-fg min-w-0 flex-1 truncate font-mono text-xs">{SITEMAP_URL}</code>
            <Button variant="ghost" size="sm" leftIcon={Copy} onClick={copy}>
              Copy URL
            </Button>
            <a
              href={SITEMAP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 px-2 text-xs font-semibold hover:underline"
            >
              Open sitemap.xml <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="text-fg-subtle text-xs">
            Tip: submit this address once in{" "}
            <a
              href={SEARCH_CONSOLE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google Search Console
            </a>{" "}
            so Google finds new content faster.
          </p>
        </CardBody>
      </Card>

      {error ? (
        <Card>
          <EmptyState
            title="Couldn't load the sitemap"
            description={apiErrorMessage(error)}
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Total URLs"
              value={isLoading ? "…" : (data?.length ?? 0)}
              icon={Map}
              tone="blue"
              hint={newest ? `Newest change ${timeAgo(newest)}` : undefined}
              active={type === "all"}
              onClick={() => setType("all")}
            />
            <StatCard
              label="Pages"
              value={isLoading ? "…" : counts.page + counts.static}
              icon={FileText}
              tone="purple"
              hint={`${counts.static} built-in`}
              active={type === "page"}
              onClick={() => toggle("page")}
            />
            <StatCard
              label="Blog posts"
              value={isLoading ? "…" : counts.blog}
              icon={Newspaper}
              tone="green"
              active={type === "blog"}
              onClick={() => toggle("blog")}
            />
            <StatCard
              label="Galleries"
              value={isLoading ? "…" : counts.gallery}
              icon={ImageIcon}
              tone="yellow"
              active={type === "gallery"}
              onClick={() => toggle("gallery")}
            />
          </div>

          <Card>
            <CardHeader
              title="URLs in the sitemap"
              description={
                data ? `${rows.length.toLocaleString()} of ${data.length.toLocaleString()} shown` : undefined
              }
            />
            <ListToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search addresses…"
              showReset={!!search || type !== "all"}
              onReset={() => {
                setSearch("");
                setType("all");
              }}
            >
              <FilterSelect
                label="Type"
                value={type}
                onChange={(v) => setType(v as EntryType | "all")}
                options={TYPE_FILTER_OPTIONS}
              />
            </ListToolbar>
            <DataTable
              columns={columns}
              rows={rows}
              loading={isLoading}
              getRowId={(e) => e.id}
              empty={<EmptyState icon={Search} title="No matching URLs" />}
            />
          </Card>
        </>
      )}
    </div>
  );
}
