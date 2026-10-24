"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Hand,
  KeyRound,
  MessageSquareReply,
  MoonStar,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Input,
  Skeleton,
  Switch,
  Tabs,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn, timeAgo } from "@/lib/utils";

import { CardHeader } from "../../_components/CardHeader";
import { Tooltip } from "../../_components/Tooltip";
import { ChatBackdrop, TemplateBubble } from "../../_components/whatsapp/TemplatePreview";
import {
  AUTOMATION_QK,
  automationApi,
  type Rule,
  type Trigger,
  type TryResult,
} from "../../_lib/automationApi";
import { HoursTab, OptOutTab } from "./SettingsTabs";
import { previewOf } from "./ReplyFields";
import { RuleModal, SAMPLE_NAMES, TRIGGERS } from "./RuleModal";

type Tab = "replies" | "hours" | "opt-out";
const SPECIAL: { trigger: Trigger; icon: LucideIcon }[] = [
  { trigger: "welcome", icon: Hand },
  { trigger: "away", icon: MoonStar },
  { trigger: "default", icon: MessageSquareReply },
];
const MATCH_LABEL = { contains: "contains", exact: "is exactly", starts_with: "starts with" };

function summary(rule: Rule) {
  const r = rule.reply;
  const kind = {
    text: "Text",
    media: r.media_kind === "document" ? "PDF" : (r.media_kind ?? "File"),
    buttons: `${r.buttons?.length ?? 0} buttons`,
    list: `List of ${r.rows?.length ?? 0}`,
    location: "Location",
  }[r.type];
  // drop *bold* / _italic_ marks around words, but keep underscores inside {{first_name}}
  const text = (r.text || r.place || "").replace(/(^|[\s(])[*_~`]+|[*_~`]+(?=[\s.,!?)]|$)/g, "$1");
  return { kind, text };
}

function TryPanel() {
  const [text, setText] = useState("");
  const [first, setFirst] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setResult((await automationApi.tryMessage(text, first)).data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Try a message"
        icon={Sparkles}
        description="Type what a customer might send and see which reply answers. Nothing is sent."
      />
      <CardBody className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Input
            name="try_text"
            aria-label="Customer message"
            placeholder="e.g. What's the price?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            wrapperClassName="flex-1"
          />
          <Button
            type="submit"
            iconOnly
            leftIcon={Send}
            aria-label="Try it"
            loading={busy}
            disabled={!text.trim()}
          />
        </form>
        <Switch checked={first} onChange={setFirst} label="As their first message ever" size="sm" />
        {result && (
          <div className="space-y-3" aria-live="polite">
            {result.matches.length === 0 ? (
              <p className="text-fg-subtle bg-page border-line rounded-lg border px-3 py-2 text-sm">
                No automatic reply. The message waits for your team in the inbox.
              </p>
            ) : (
              result.matches.map((m, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-sm">
                    <span className="text-fg font-semibold">
                      {m.rule?.name ??
                        (m.kind === "opt_out"
                          ? "Opt-out"
                          : m.kind === "opt_in"
                            ? "Opt-in"
                            : m.kind === "chatbot"
                              ? "Chatbot"
                              : "Reply")}
                    </span>
                    <span className="text-fg-subtle"> · {m.reason}</span>
                  </p>
                  {m.reply && (
                    <ChatBackdrop className="flex justify-center py-4">
                      <TemplateBubble {...previewOf(m.reply)} values={SAMPLE_NAMES} highlight={false} />
                    </ChatBackdrop>
                  )}
                </div>
              ))
            )}
            <p className="text-fg-faint text-xs">
              Right now you&apos;re {result.open_now ? "open" : "closed"} (office hours).
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function Automation() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const tab = (params.get("tab") as Tab) || "replies";
  const setTab = (t: Tab) =>
    router.replace(`${pathname}${t === "replies" ? "" : `?tab=${t}`}`, { scroll: false });
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState<Trigger | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: AUTOMATION_QK.RULES,
    queryFn: async () => (await automationApi.rules()).data,
    refetchInterval: 30_000,
  });
  const { data: settings } = useQuery({
    queryKey: AUTOMATION_QK.SETTINGS,
    queryFn: async () => (await automationApi.settings()).data,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: AUTOMATION_QK.ALL });

  const keywordRules = (rules ?? []).filter((r) => r.trigger === "keyword");
  const special = (t: Trigger) => (rules ?? []).find((r) => r.trigger === t) ?? null;
  const sent = (rules ?? []).reduce((n, r) => n + r.hits, 0);
  const activeCount = (rules ?? []).filter((r) => r.active).length;

  const toggle = async (r: Rule, active: boolean) => {
    try {
      const res = await automationApi.setActive(r.id, active);
      toast.success(`${r.name}: ${res.message?.toLowerCase() ?? "saved"}`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const remove = async (r: Rule) => {
    const ok = await confirm({
      title: `Delete ${r.name}?`,
      message: "Customers won't get this reply any more.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await automationApi.remove(r.id);
      toast.success("Automatic reply deleted");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const move = async (index: number, by: number) => {
    const ids = keywordRules.map((r) => r.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    const specials = (rules ?? []).filter((r) => r.trigger !== "keyword").map((r) => r.id);
    try {
      await automationApi.reorder([...ids, ...specials]);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <h1 className="sr-only">Automation</h1>
      <KpiGrid cols={4}>
        <KpiTile
          icon={Zap}
          tone="green"
          label="Active replies"
          value={rules ? activeCount : undefined}
          hint={`${rules?.length ?? 0} in total`}
        />
        <KpiTile
          icon={Send}
          tone="blue"
          label="Replies sent"
          value={rules ? sent : undefined}
          hint="Since each was created"
        />
        <KpiTile
          icon={Clock}
          tone={settings?.open_now ? "purple" : "amber"}
          label="Right now"
          value={settings ? (settings.open_now ? "Open" : "Closed") : undefined}
          hint={settings?.open_now ? "Office hours" : "Away replies are on"}
          onClick={() => setTab("hours")}
          active={tab === "hours"}
        />
        <KpiTile
          icon={KeyRound}
          tone="slate"
          label="Opt-out words"
          value={settings?.opt_out_keywords.length}
          hint={settings ? settings.opt_out_keywords.slice(0, 3).join(", ").toUpperCase() : undefined}
          onClick={() => setTab("opt-out")}
          active={tab === "opt-out"}
        />
      </KpiGrid>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <div className="px-4 pt-2 sm:px-5">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "replies", label: "Replies", count: rules?.length },
                { value: "hours", label: "Office hours" },
                { value: "opt-out", label: "Opt-out" },
              ]}
            />
          </div>

          {tab === "replies" && (
            <div className="space-y-6 p-4 sm:p-5">
              <section>
                <h2 className="text-fg mb-3 text-sm font-semibold">Always-on replies</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  {SPECIAL.map(({ trigger, icon: Icon }) => {
                    const r = special(trigger);
                    return (
                      <div
                        key={trigger}
                        className={cn(
                          "border-line rounded-xl border p-4",
                          r?.active ? "bg-surface" : "bg-page"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="bg-primary-soft text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-fg text-sm font-semibold">{TRIGGERS[trigger].label}</p>
                            <p className="text-fg-subtle text-xs">{TRIGGERS[trigger].hint}</p>
                          </div>
                          {r && (
                            <Switch
                              checked={r.active}
                              onChange={(v) => toggle(r, v)}
                              label={<span className="sr-only">{r.active ? "On" : "Off"}</span>}
                              size="sm"
                              aria-label={`${TRIGGERS[trigger].label} on`}
                            />
                          )}
                        </div>
                        <p className="text-fg-muted mt-3 line-clamp-2 min-h-8 text-xs">
                          {r ? summary(r).text || summary(r).kind : "Not set up yet."}
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-fg-faint text-[11px]">
                            {r
                              ? `${r.hits} sent${r.last_hit_at ? ` · last ${timeAgo(r.last_hit_at)}` : ""}`
                              : ""}
                          </span>
                          <Button
                            size="sm"
                            variant={r ? "ghost" : "secondary"}
                            leftIcon={r ? Pencil : Plus}
                            onClick={() => (r ? setEditing(r) : setCreating(trigger))}
                          >
                            {r ? "Edit" : "Set up"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-fg text-sm font-semibold">Keyword replies</h2>
                    <p className="text-fg-subtle text-xs">
                      Checked from top to bottom; the first match answers.
                    </p>
                  </div>
                  <Button size="sm" leftIcon={Plus} onClick={() => setCreating("keyword")}>
                    New keyword reply
                  </Button>
                </div>
                {isLoading ? (
                  <Skeleton className="h-32" />
                ) : keywordRules.length === 0 ? (
                  <div className="border-line rounded-xl border border-dashed">
                    <EmptyState
                      icon={Zap}
                      title="No keyword replies yet"
                      description="Answer common questions instantly: prices, timings, location, order status…"
                    />
                  </div>
                ) : (
                  <ul
                    className="divide-line border-line divide-y rounded-xl border"
                    aria-label="Keyword replies"
                  >
                    {keywordRules.map((r, i) => {
                      const s = summary(r);
                      return (
                        <li
                          key={r.id}
                          className={cn("flex items-center gap-3 px-3 py-3", !r.active && "opacity-60")}
                        >
                          <span className="flex flex-col">
                            <button
                              type="button"
                              aria-label={`Move ${r.name} up`}
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                              className="text-fg-faint hover:text-fg disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${r.name} down`}
                              disabled={i === keywordRules.length - 1}
                              onClick={() => move(i, 1)}
                              className="text-fg-faint hover:text-fg disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-fg flex items-center gap-2 text-sm font-medium">
                              <span className="truncate">{r.name}</span>
                              <Badge>{s.kind}</Badge>
                            </p>
                            <p className="text-fg-subtle mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                              <span>When a message {MATCH_LABEL[r.match]}</span>
                              {r.keywords.slice(0, 6).map((k) => (
                                <span
                                  key={k}
                                  className="bg-page border-line rounded border px-1.5 font-mono text-[11px]"
                                >
                                  {k}
                                </span>
                              ))}
                              {r.keywords.length > 6 && <span>+{r.keywords.length - 6}</span>}
                            </p>
                          </div>
                          <span className="text-fg-faint hidden w-28 text-right text-[11px] sm:block">
                            {r.hits} sent
                            {r.last_hit_at ? <span className="block">{timeAgo(r.last_hit_at)}</span> : null}
                          </span>
                          <Switch
                            checked={r.active}
                            onChange={(v) => toggle(r, v)}
                            size="sm"
                            aria-label={`${r.name} on`}
                          />
                          <Tooltip label="Edit">
                            <Button
                              size="sm"
                              variant="ghost"
                              iconOnly
                              leftIcon={Pencil}
                              aria-label={`Edit ${r.name}`}
                              onClick={() => setEditing(r)}
                            />
                          </Tooltip>
                          <Tooltip label="Delete" align="end">
                            <Button
                              size="sm"
                              variant="ghost"
                              iconOnly
                              leftIcon={Trash2}
                              aria-label={`Delete ${r.name}`}
                              onClick={() => remove(r)}
                              className="hover:text-danger"
                            />
                          </Tooltip>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
          {tab === "hours" && settings && (
            <HoursTab key={JSON.stringify(settings.hours)} initial={settings} onSaved={refresh} />
          )}
          {tab === "opt-out" && settings && (
            <OptOutTab key={settings.opt_out_keywords.join()} initial={settings} onSaved={refresh} />
          )}
        </Card>

        <TryPanel />
      </div>

      <RuleModal
        key={editing ? `edit-${editing.id}` : `new-${creating ?? "none"}`}
        rule={editing}
        trigger={creating}
        onClose={() => {
          setEditing(null);
          setCreating(null);
        }}
        onSaved={() => {
          setEditing(null);
          setCreating(null);
          refresh();
        }}
      />
    </>
  );
}
