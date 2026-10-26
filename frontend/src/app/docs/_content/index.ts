import { API_PAGES } from "./api";
import { GETTING_STARTED } from "./getting-started";
import { GUIDE_PAGES, HELP_PAGES } from "./guides";
import type { Block, DocPage, Method, Section } from "./types";
import { EVENT_DOCS, WEBHOOK_PAGES } from "./webhooks";

export const PAGES: DocPage[] = [
  ...GETTING_STARTED,
  ...API_PAGES,
  ...WEBHOOK_PAGES,
  ...GUIDE_PAGES,
  ...HELP_PAGES,
];

/** API pages are grouped in the sidebar. */
export const API_GROUPS: { label: string; slugs: string[] }[] = [
  { label: "Account", slugs: ["api/me"] },
  {
    label: "Messages",
    slugs: ["api/send-message", "api/send-template", "api/send-media", "api/get-message"],
  },
  {
    label: "Contacts",
    slugs: [
      "api/list-contacts",
      "api/upsert-contact",
      "api/get-contact",
      "api/update-contact",
      "api/delete-contact",
    ],
  },
  { label: "Conversations", slugs: ["api/list-conversations", "api/conversation-messages"] },
  { label: "Templates", slugs: ["api/list-templates"] },
  { label: "Orders", slugs: ["api/list-orders", "api/get-order"] },
];

export function href(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export function pageBySlug(slug: string): DocPage | undefined {
  return PAGES.find((p) => p.slug === slug);
}

/** Reading order (sidebar order), for "previous / next" links. */
export function ordered(): DocPage[] {
  const api = API_GROUPS.flatMap((g) => g.slugs).map((s) => pageBySlug(s)!);
  return [...GETTING_STARTED, ...api, ...WEBHOOK_PAGES, ...GUIDE_PAGES, ...HELP_PAGES];
}

export function neighbours(slug: string): { prev?: DocPage; next?: DocPage } {
  const list = ordered();
  const i = list.findIndex((p) => p.slug === slug);
  return { prev: list[i - 1], next: list[i + 1] };
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function headingId(b: Extract<Block, { t: "h2" | "h3" }>) {
  return b.id ?? slugify(b.text);
}

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Headings for "On this page". Endpoint pages also list their parameter tables. */
export function toc(page: DocPage): TocItem[] {
  const out: TocItem[] = [];
  for (const b of page.blocks) {
    if (b.t === "h2" || b.t === "h3")
      out.push({ id: headingId(b), text: b.text, level: b.t === "h2" ? 2 : 3 });
    if (b.t === "params") out.push({ id: slugify(b.title), text: b.title, level: 2 });
    if (b.t === "endpoint") out.push({ id: "try-it", text: "Try it", level: 2 });
    if (b.t === "events")
      for (const e of EVENT_DOCS) out.push({ id: slugify(e.event), text: e.event, level: 3 });
  }
  return out;
}

/** Markdown-lite to plain words, for search. */
export function plain(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchEntry {
  slug: string;
  anchor: string | null;
  page: string;
  heading: string | null;
  text: string;
  section: Section;
  method?: Method;
  path?: string;
}

function blockText(b: Block): string {
  switch (b.t) {
    case "p":
    case "h2":
    case "h3":
      return b.text;
    case "list":
      return b.items.join(" ");
    case "callout":
      return `${b.title ?? ""} ${b.text}`;
    case "steps":
      return b.items.map((s) => `${s.title} ${s.text}`).join(" ");
    case "params":
      return b.rows.map((r) => `${r.name} ${r.desc}`).join(" ");
    case "table":
      return [...b.head, ...b.rows.flat()].join(" ");
    case "cards":
      return b.items.map((c) => `${c.title} ${c.text}`).join(" ");
    case "endpoint":
      return `${b.spec.method} ${b.spec.path}`;
    case "image":
      return `${b.shot.alt} ${b.shot.caption ?? ""}`;
    default:
      return "";
  }
}

/** One entry per page and per section of a page, so results can jump straight to the right heading. */
export function searchIndex(): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const page of PAGES) {
    const endpoint = page.blocks.find((b) => b.t === "endpoint");
    const base = {
      slug: page.slug,
      page: page.title,
      section: page.section,
      method: page.method,
      path: endpoint?.t === "endpoint" ? endpoint.spec.path : undefined,
    };
    let current: SearchEntry = { ...base, anchor: null, heading: null, text: page.description };
    out.push(current);
    for (const b of page.blocks) {
      if (b.t === "h2" || b.t === "h3" || b.t === "params") {
        const heading = b.t === "params" ? b.title : b.text;
        current = { ...base, anchor: b.t === "params" ? slugify(b.title) : headingId(b), heading, text: "" };
        out.push(current);
      }
      if (b.t === "events") {
        for (const e of EVENT_DOCS) {
          out.push({ ...base, anchor: slugify(e.event), heading: e.event, text: e.when });
        }
      }
      current.text = plain(`${current.text} ${blockText(b)}`);
    }
  }
  return out;
}
