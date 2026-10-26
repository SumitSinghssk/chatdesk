"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";

import { siteConfig } from "@/config/site";

import { API_PATH } from "../_content/types";

const noop = () => () => {};

/** The API's address on this site, e.g. https://chatdesk.app/api/v1/public. */
export function useBaseUrl() {
  return useSyncExternalStore(
    noop,
    () => `${window.location.origin}${API_PATH}`,
    () => `${siteConfig.url}${API_PATH}`
  );
}

export function withBase(text: string, base: string) {
  return text.replaceAll("{{BASE_URL}}", base);
}

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;

/** Markdown-lite: `code`, **bold**, *italic* and [links](/docs/x). */
export function Inline({ text }: { text: string }) {
  const base = useBaseUrl();
  const parts = withBase(text, base).split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={i}
              className="border-line bg-page text-fg rounded-[5px] border px-[5px] py-px font-mono text-[0.86em] break-words"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-fg font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (link) {
          const [, label, to] = link;
          const external = /^https?:/.test(to);
          return external ? (
            <a
              key={i}
              href={to}
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium hover:underline"
            >
              {label}
            </a>
          ) : (
            <Link key={i} href={to} className="text-primary font-medium hover:underline">
              <Inline text={label} />
            </Link>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function InlineText({ text }: { text: string }): ReactNode {
  return <Inline text={text} />;
}
