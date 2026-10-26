"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Code2, Zap } from "lucide-react";

import { Card, Tabs } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { KeysTab } from "./KeysTab";
import { WebhooksTab } from "./WebhooksTab";

type Tab = "keys" | "webhooks";

const GUIDES = [
  {
    icon: BookOpen,
    title: "Getting started",
    text: "Send your first message in 5 minutes",
    href: CUSTOMER_ROUTES.DOCS(),
  },
  {
    icon: Code2,
    title: "API reference",
    text: "Every endpoint, with a Try it button",
    href: `${CUSTOMER_ROUTES.DOCS()}/api/send-message`,
  },
  {
    icon: Zap,
    title: "Zapier & Make",
    text: "Connect 6,000+ apps without code",
    href: `${CUSTOMER_ROUTES.DOCS()}/guides/zapier`,
  },
];

export function Integrations() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "keys";
  const setTab = (t: Tab) =>
    router.replace(`${pathname}${t === "keys" ? "" : `?tab=${t}`}`, { scroll: false });

  return (
    <div className="max-w-6xl space-y-5">
      <h1 className="sr-only">Integrations</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {GUIDES.map((g) => (
          <a
            key={g.title}
            href={g.href}
            target="_blank"
            rel="noreferrer"
            className="border-line bg-surface hover:border-primary/40 group flex items-start gap-3 rounded-xl border p-4 shadow-xs transition"
          >
            <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
              <g.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="text-fg group-hover:text-primary block text-sm font-semibold">{g.title}</span>
              <span className="text-fg-subtle block text-xs">{g.text}</span>
            </span>
          </a>
        ))}
      </div>
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "keys", label: "API keys" },
              { value: "webhooks", label: "Webhooks" },
            ]}
          />
        </div>
        {tab === "keys" ? <KeysTab /> : <WebhooksTab />}
      </Card>
    </div>
  );
}
