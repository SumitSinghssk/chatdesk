"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CalendarCheck,
  Copy,
  Download,
  FilePlus2,
  Headset,
  LayoutList,
  Megaphone,
  MessageCircleHeart,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  EmptyState,
  Input,
  Modal,
  RadioGroup,
  Skeleton,
  Switch,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes/customer";
import { cn, timeAgo } from "@/lib/utils";

import { TagInput } from "../../_components/TagInput";
import {
  CHATBOTS_QK,
  chatbotsApi,
  TRIGGER_LABELS,
  triggerSummary,
  type BotExport,
  type BotTrigger,
  type Chatbot,
  type Starter,
} from "../../_lib/chatbotsApi";

const STARTER_ICONS: Record<string, LucideIcon> = {
  main_menu: LayoutList,
  lead_capture: UserPlus,
  appointment: CalendarCheck,
  feedback: Star,
  order_status: Search,
  blank: FilePlus2,
};

function NewBotModal({
  open,
  onClose,
  starters,
}: {
  open: boolean;
  onClose: () => void;
  starters: Starter[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pick, setPick] = useState<string>("blank");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<BotTrigger>("keyword");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const choose = (key: string) => {
    setPick(key);
    const s = starters.find((x) => x.key === key);
    setName(s?.name ?? "");
    setTrigger(s?.trigger ?? "keyword");
    setKeywords(s?.keywords ?? []);
  };
  const create = async () => {
    setBusy(true);
    try {
      const res = await chatbotsApi.create({
        name: name.trim() || "New chatbot",
        trigger,
        keywords,
        match: "exact",
        starter: pick === "blank" ? null : pick,
      });
      toast.success("Chatbot created");
      void queryClient.invalidateQueries({ queryKey: CHATBOTS_QK.ALL });
      router.push(CUSTOMER_ROUTES.CHATBOT(res.data.id));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const options = [
    ...starters,
    {
      key: "blank",
      name: "Start from scratch",
      description: "An empty canvas with just the Start block.",
      trigger: "keyword" as BotTrigger,
      keywords: [],
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New chatbot"
      description="Start from a ready-made flow (you can change everything) or from scratch."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={busy} disabled={trigger === "keyword" && keywords.length === 0}>
            Create and open
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Start from">
          {options.map((s) => {
            const Icon = STARTER_ICONS[s.key] ?? Bot;
            const on = pick === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(s.key)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                  on
                    ? "border-primary bg-primary-soft ring-primary/20 ring-2"
                    : "border-line hover:border-line-strong"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    on ? "bg-primary text-white" : "bg-page text-fg-subtle"
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="text-fg block text-sm font-semibold">{s.name}</span>
                  <span className="text-fg-subtle block text-xs leading-snug">{s.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Input
          name="new_bot_name"
          label="Name"
          value={name}
          placeholder="e.g. Main menu"
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
        <RadioGroup<BotTrigger>
          name="new_bot_trigger"
          label="Starts when"
          columns={2}
          value={trigger}
          onChange={setTrigger}
          options={(Object.keys(TRIGGER_LABELS) as BotTrigger[]).map((t) => ({
            value: t,
            label: TRIGGER_LABELS[t].label,
            description: TRIGGER_LABELS[t].hint,
          }))}
        />
        {trigger === "keyword" && (
          <TagInput
            id="new-bot-keywords"
            label="Keywords"
            value={keywords}
            onChange={setKeywords}
            placeholder="menu, hi… press Enter after each"
          />
        )}
      </div>
    </Modal>
  );
}

function BotCard({ bot, onChanged }: { bot: Chatbot; onChanged: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const status = !bot.published
    ? { label: "Draft", tone: "warning" as const }
    : bot.active
      ? { label: bot.has_changes ? "Live · unpublished edits" : "Live", tone: "success" as const }
      : { label: "Off", tone: "neutral" as const };
  const act = async (fn: () => Promise<{ message?: string }>) => {
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const exportBot = async () => {
    const res = await chatbotsApi.exportBot(bot.id);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `${bot.name.replace(/[^\w-]+/g, "-").toLowerCase() || "chatbot"}.json`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={CUSTOMER_ROUTES.CHATBOT(bot.id)}
            className="text-fg hover:text-primary block truncate font-semibold"
          >
            {bot.name}
          </Link>
          <Badge tone={status.tone} dot className="mt-1">
            {status.label}
          </Badge>
        </div>
        {bot.published && (
          <Switch
            checked={bot.active}
            onChange={(on) => act(() => chatbotsApi.setActive(bot.id, on))}
            aria-label={`${bot.name} on`}
            size="sm"
          />
        )}
        <Dropdown
          align="right"
          trigger={() => (
            <span
              className="text-fg-subtle hover:bg-page flex h-8 w-8 items-center justify-center rounded-lg"
              aria-label={`More for ${bot.name}`}
            >
              <MoreVertical className="h-4 w-4" />
            </span>
          )}
          items={[
            { label: "Edit", icon: Pencil, href: CUSTOMER_ROUTES.CHATBOT(bot.id) },
            {
              label: "Duplicate",
              icon: Copy,
              onClick: () =>
                act(async () => {
                  const res = await chatbotsApi.duplicate(bot.id);
                  router.push(CUSTOMER_ROUTES.CHATBOT(res.data.id));
                  return res;
                }),
            },
            { label: "Export (JSON)", icon: Download, onClick: () => void exportBot() },
            "divider",
            {
              label: "Delete",
              icon: Trash2,
              danger: true,
              onClick: async () => {
                const ok = await confirm({
                  title: `Delete ${bot.name}?`,
                  message: "Its reports go too. Chats it's in right now stop getting its messages.",
                  confirmLabel: "Delete",
                  variant: "danger",
                });
                if (ok) void act(() => chatbotsApi.remove(bot.id));
              },
            },
          ]}
        />
      </div>
      {bot.description && <p className="text-fg-subtle mt-2 line-clamp-2 text-sm">{bot.description}</p>}
      <p className="bg-page text-fg mt-3 rounded-lg px-3 py-2 text-xs">
        <span className="text-fg-subtle">Starts: </span>
        {triggerSummary(bot)}
      </p>
      <div className="text-fg-subtle mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="text-fg text-base font-semibold tabular-nums">{bot.stats.started}</p>
          chats (30 days)
        </div>
        <div>
          <p className="text-fg text-base font-semibold tabular-nums">
            {bot.stats.completion_rate === null ? "—" : `${bot.stats.completion_rate}%`}
          </p>
          completed
        </div>
        <div>
          <p className="text-fg text-base font-semibold tabular-nums">{bot.stats.active}</p>
          talking now
        </div>
      </div>
      <div className="border-line mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-fg-faint text-xs">
          {bot.blocks} blocks · edited {timeAgo(bot.updated_at)}
        </span>
        <Link
          href={CUSTOMER_ROUTES.CHATBOT(bot.id)}
          className="text-primary text-sm font-medium hover:underline"
        >
          Open builder
        </Link>
      </div>
    </Card>
  );
}

export function Chatbots() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bots = useQuery({ queryKey: CHATBOTS_QK.LIST, queryFn: async () => (await chatbotsApi.list()).data });
  const starters = useQuery({
    queryKey: ["chatbots", "starters"],
    queryFn: async () => (await chatbotsApi.starters()).data,
    staleTime: Infinity,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: CHATBOTS_QK.ALL });
  const list = bots.data ?? [];
  const totals = list.reduce(
    (t, b) => ({
      started: t.started + b.stats.started,
      handover: t.handover + b.stats.handover,
      completed: t.completed + b.stats.completed,
      active: t.active + b.stats.active,
    }),
    { started: 0, handover: 0, completed: 0, active: 0 }
  );
  const done = totals.started - totals.active;

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as BotExport;
      if (parsed.format !== "chatdesk-chatbot")
        throw new Error("This isn't a chatbot file exported from ChatDesk");
      const res = await chatbotsApi.importBot({
        name: `${parsed.name} (imported)`.slice(0, 120),
        bot: parsed.bot,
        graph: parsed.graph,
      });
      toast.success("Chatbot imported");
      refresh();
      router.push(CUSTOMER_ROUTES.CHATBOT(res.data.id));
    } catch (err) {
      toast.error(err instanceof SyntaxError ? "That file isn't valid JSON" : errorMessage(err));
    }
  };

  return (
    <div className="w-full">
      <h1 className="sr-only">Chatbots</h1>
      <KpiGrid cols={4}>
        <KpiTile
          icon={Bot}
          tone="green"
          label="Live chatbots"
          value={list.filter((b) => b.active).length}
          hint={`${list.length} in all`}
        />
        <KpiTile
          icon={MessageCircleHeart}
          tone="blue"
          label="Chats (30 days)"
          value={totals.started}
          hint={`${totals.active} talking now`}
        />
        <KpiTile
          icon={Sparkles}
          tone="purple"
          label="Completed"
          value={done ? `${Math.round((100 * (totals.completed + totals.handover)) / done)}%` : "—"}
          hint="finished or handed over"
        />
        <KpiTile icon={Headset} tone="amber" label="Handed to the team" value={totals.handover} />
      </KpiGrid>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-fg text-sm font-semibold">
          Your chatbots <span className="text-fg-faint ml-1 font-normal tabular-nums">{list.length}</span>
        </h2>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import chatbot file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importFile(f);
            }}
          />
          <Tooltip label="Import a chatbot file" align="end">
            <Button
              variant="secondary"
              iconOnly
              leftIcon={Upload}
              aria-label="Import"
              onClick={() => fileRef.current?.click()}
              className="h-9 w-9"
            />
          </Tooltip>
          <Button leftIcon={Plus} onClick={() => setCreating(true)}>
            New chatbot
          </Button>
        </div>
      </div>

      {bots.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Bot}
            title="No chatbots yet"
            description="Pick a ready-made flow to begin; every part of it can be changed on the canvas."
            className="py-6"
          />
          <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(starters.data ?? []).map((s) => {
              const Icon = STARTER_ICONS[s.key] ?? Bot;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setCreating(true)}
                  className="border-line hover:border-primary flex items-start gap-3 rounded-xl border p-3 text-left transition"
                >
                  <span className="bg-page text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="text-fg block text-sm font-semibold">{s.name}</span>
                    <span className="text-fg-subtle block text-xs">{s.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Chatbots">
          {list.map((b) => (
            <BotCard key={b.id} bot={b} onChanged={refresh} />
          ))}
        </div>
      )}
      <div className="text-fg-faint mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        <p className="flex items-start gap-2">
          <Users className="mt-px h-3.5 w-3.5 shrink-0" /> Agents can start a published chatbot in any chat
          from the inbox.
        </p>
        <p className="flex items-start gap-2">
          <Megaphone className="mt-px h-3.5 w-3.5 shrink-0" /> Use a template button&apos;s text as a keyword
          to start one from a campaign.
        </p>
      </div>
      {creating && (
        <NewBotModal open={creating} onClose={() => setCreating(false)} starters={starters.data ?? []} />
      )}
    </div>
  );
}
