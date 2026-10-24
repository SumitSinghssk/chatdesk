import type { Metadata, Viewport } from "next";

import { AiChat } from "./AiChat";

export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { key } = await params;
  const q = await searchParams;
  return <AiChat agentKey={key} embed={q.embed === "1"} host={q.host ?? null} page={q.page ?? null} />;
}
