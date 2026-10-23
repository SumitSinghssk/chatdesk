"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Code2,
  Globe,
  MessageCircle,
  MessagesSquare,
  Plug,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import { Badge, Button, EmptyState, Skeleton, Tabs } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes/customer";
import { cn } from "@/lib/utils";

import { AI_QK, aiAgentApi } from "../../../_lib/aiAgentApi";
import { ProviderMark } from "../ProviderMark";
import { Behaviour } from "./Behaviour";
import { Channels } from "./Channels";
import { Conversations } from "./Conversations";
import { Knowledge } from "./Knowledge";
import { TestChat } from "./TestChat";
import { Usage } from "./Usage";

type Tab = "knowledge" | "behaviour" | "channels" | "conversations" | "usage";
const TABS: Tab[] = ["knowledge", "behaviour", "channels", "conversations", "usage"];

export function AgentWorkspace({ id }: { id: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab") as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : "knowledge";
  const [testing, setTesting] = useState(false);
  const agent = useQuery({
    queryKey: AI_QK.AGENT(id),
    queryFn: () => aiAgentApi.get(id).then((r) => r.data),
  });
  const a = agent.data;

  if (agent.isError) {
    return (
      <EmptyState
        icon={Sparkles}
        title="AI agent not found"
        description="It may have been deleted."
        action={<Button href={CUSTOMER_ROUTES.AI_AGENT()}>All agents</Button>}
      />
    );
  }
  if (!a) return <Skeleton className="h-[70vh] rounded-xl" />;

  const go = (next: Tab) => router.replace(`${pathname}?tab=${next}`, { scroll: false });
  const sources = Object.values(a.knowledge.sources).reduce((x, y) => x + (y ?? 0), 0);
  const tabs = [
    {
      value: "knowledge" as Tab,
      label: (
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-4 w-4" aria-hidden />
          Knowledge
        </span>
      ),
      count: sources,
    },
    {
      value: "behaviour" as Tab,
      label: (
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Behaviour
        </span>
      ),
    },
    {
      value: "channels" as Tab,
      label: (
        <span className="flex items-center gap-1.5">
          <Plug className="h-4 w-4" aria-hidden />
          Channels
        </span>
      ),
    },
    {
      value: "conversations" as Tab,
      label: (
        <span className="flex items-center gap-1.5">
          <MessagesSquare className="h-4 w-4" aria-hidden />
          Conversations
        </span>
      ),
    },
    {
      value: "usage" as Tab,
      label: (
        <span className="flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4" aria-hidden />
          Usage
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          href={CUSTOMER_ROUTES.AI_AGENT()}
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={ArrowLeft}
          aria-label="All AI agents"
        />
        <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-xl">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-fg truncate text-xl font-bold tracking-tight">{a.name}</h1>
          <p className="text-fg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {a.connection ? (
              <span className="inline-flex items-center gap-1.5">
                <ProviderMark provider={a.connection.provider} size="sm" />
                {a.model}
              </span>
            ) : (
              <span className="text-warning">No AI provider</span>
            )}
            {a.behaviour.business_name && <span>· {a.behaviour.business_name}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {a.whatsapp_enabled && (
            <Badge tone="success">
              <MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp
            </Badge>
          )}
          {a.widget_enabled && (
            <Badge tone="success">
              <Globe className="h-3 w-3" aria-hidden /> Website
            </Badge>
          )}
          {a.api_enabled && (
            <Badge tone="success">
              <Code2 className="h-3 w-3" aria-hidden /> API
            </Badge>
          )}
          {!a.whatsapp_enabled && !a.widget_enabled && !a.api_enabled && <Badge>Not live yet</Badge>}
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={go} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {tab === "knowledge" && <Knowledge agent={a} />}
          {tab === "behaviour" && <Behaviour key={a.updated_at} agent={a} />}
          {tab === "channels" && <Channels key={`${a.public_key}-${a.secret_hint}`} agent={a} />}
          {tab === "conversations" && <Conversations agent={a} />}
          {tab === "usage" && <Usage agent={a} />}
        </div>
        <aside className="border-line hidden overflow-hidden rounded-xl border xl:sticky xl:top-4 xl:block xl:h-[calc(100dvh-8rem)]">
          <TestChat agent={a} className="h-full" />
        </aside>
      </div>

      <Button
        onClick={() => setTesting(true)}
        leftIcon={Sparkles}
        className="fixed right-4 bottom-4 z-40 rounded-full shadow-lg xl:hidden"
        aria-label="Test the agent"
      >
        Test
      </Button>
      {testing && (
        <div
          className="bg-surface fixed inset-0 z-[70] flex flex-col xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Test the agent"
        >
          <div className="border-line flex items-center justify-end border-b px-2 py-1">
            <Button variant="ghost" size="sm" leftIcon={X} onClick={() => setTesting(false)}>
              Close
            </Button>
          </div>
          <TestChat agent={a} className={cn("min-h-0 flex-1")} />
        </div>
      )}
    </div>
  );
}
