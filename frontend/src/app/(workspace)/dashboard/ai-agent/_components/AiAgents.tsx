"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  Code2,
  Copy,
  FileText,
  Globe,
  Headset,
  KeyRound,
  MessageCircle,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRoundCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dropdown,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes/customer";
import { cn, timeAgo } from "@/lib/utils";

import { AI_QK, aiAgentApi, compact, usd, type AgentSummary, type Connection } from "../../_lib/aiAgentApi";
import { ConnectionModal, useProviders } from "./ConnectionModal";
import { ProviderMark } from "./ProviderMark";

const STARTERS: { key: string; label: string; text: string; icon: LucideIcon }[] = [
  {
    key: "support",
    label: "Customer support",
    text: "Answers questions about products, prices, timings and policies.",
    icon: Headset,
  },
  {
    key: "sales",
    label: "Sales assistant",
    text: "Finds the right product, shares prices and collects leads.",
    icon: ShoppingBag,
  },
  {
    key: "booking",
    label: "Bookings",
    text: "Takes appointment or visit requests and passes them to your team.",
    icon: CalendarCheck,
  },
  { key: "blank", label: "Start blank", text: "Write the instructions yourself.", icon: Pencil },
];

export function useConnections() {
  return useQuery({
    queryKey: AI_QK.CONNECTIONS,
    queryFn: () => aiAgentApi.connections().then((r) => r.data),
  });
}

export function modelOptions(connection: Connection | undefined, current?: string | null) {
  const ids = connection?.models.length ? connection.models : [];
  const all = current && !ids.includes(current) ? [current, ...ids] : ids;
  return all.map((m) => ({ value: m, label: m }));
}

function NewAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const connections = useConnections().data ?? [];
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [starter, setStarter] = useState("support");
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = connections.find((c) => c.id === (connectionId ?? connections[0]?.id));

  const create = async () => {
    setSaving(true);
    try {
      const res = await aiAgentApi.create({
        name: name.trim(),
        business_name: business.trim(),
        starter,
        connection_id: chosen?.id ?? null,
        model,
      });
      await qc.invalidateQueries({ queryKey: AI_QK.AGENTS });
      toast.success("AI agent created. Now add what it should know.");
      router.push(CUSTOMER_ROUTES.AI_AGENT_DETAIL(res.data.id, "knowledge"));
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="modal"
      size="lg"
      title="New AI agent"
      description="Give it a name and a job. You'll add its knowledge next."
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={saving} disabled={!name.trim()} leftIcon={Sparkles}>
            Create agent
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Agent name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Asha"
            hint="Customers see this name."
            required
            autoFocus
          />
          <Input
            label="Business name"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            placeholder="e.g. Sumit Sweets"
          />
        </div>
        <div>
          <p className="text-fg mb-2 text-sm font-medium">What will it do?</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Job">
            {STARTERS.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={starter === s.key}
                onClick={() => setStarter(s.key)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                  starter === s.key
                    ? "border-primary bg-primary-soft ring-primary/30 ring-2"
                    : "border-line hover:bg-hover"
                )}
              >
                <s.icon className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  <span className="text-fg block text-sm font-semibold">{s.label}</span>
                  <span className="text-fg-subtle block text-xs">{s.text}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        {connections.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="AI provider"
              value={chosen?.id ?? null}
              onChange={(v) => {
                setConnectionId(Number(v));
                setModel(null);
              }}
              options={connections.map((c) => ({ value: c.id, label: `${c.label} (${c.provider_label})` }))}
            />
            <Select
              label="Model"
              value={model ?? ""}
              onChange={(v) => setModel(v || null)}
              placeholder="Recommended"
              searchable
              clearable
              options={modelOptions(chosen)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function ChannelChip({ on, icon: Icon, label }: { on: boolean; icon: LucideIcon; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        on ? "bg-success-soft text-success" : "bg-hover text-fg-faint"
      )}
      title={`${label}: ${on ? "on" : "off"}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
      <span className="sr-only">{on ? " on" : " off"}</span>
    </span>
  );
}

function AgentCard({
  agent,
  onDuplicate,
  onDelete,
}: {
  agent: AgentSummary;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const k = agent.knowledge;
  const sources = Object.values(k.sources).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <Card className="flex flex-col p-4 transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="bg-primary-soft text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={CUSTOMER_ROUTES.AI_AGENT_DETAIL(agent.id)}
            className="text-fg block truncate text-base font-semibold hover:underline"
          >
            {agent.name}
          </Link>
          <p className="text-fg-subtle flex items-center gap-1.5 truncate text-xs">
            {agent.connection ? (
              <>
                <ProviderMark provider={agent.connection.provider} size="sm" />
                <span className="truncate">{agent.model}</span>
              </>
            ) : (
              "No AI provider yet"
            )}
          </p>
        </div>
        <Dropdown
          trigger={() => (
            <span
              className="text-fg-subtle hover:bg-hover rounded-md p-1.5"
              aria-label={`More for ${agent.name}`}
            >
              <MoreVertical className="h-4 w-4" />
            </span>
          )}
          items={[
            { label: "Open", icon: Pencil, href: CUSTOMER_ROUTES.AI_AGENT_DETAIL(agent.id) },
            { label: "Duplicate", icon: Copy, onClick: onDuplicate },
            "divider",
            { label: "Delete", icon: Trash2, danger: true, onClick: onDelete },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ChannelChip on={agent.whatsapp_enabled} icon={MessageCircle} label="WhatsApp" />
        <ChannelChip on={agent.widget_enabled} icon={Globe} label="Website" />
        <ChannelChip on={agent.api_enabled} icon={Code2} label="API" />
      </div>
      <dl className="border-line mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
        <div>
          <dt className="text-fg-subtle text-[11px]">Knowledge</dt>
          <dd className="text-fg text-sm font-semibold tabular-nums">{sources}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle text-[11px]">Replies · 30d</dt>
          <dd className="text-fg text-sm font-semibold tabular-nums">
            {compact.format(agent.stats.replies ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-subtle text-[11px]">Cost · 30d</dt>
          <dd className="text-fg text-sm font-semibold tabular-nums">{usd(agent.stats.cost)}</dd>
        </div>
      </dl>
      {(agent.problem || k.needs_training || !sources) && (
        <p className="bg-warning-soft text-warning mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {agent.problem ??
            (!sources ? "Add documents, pages or Q&A so it can answer." : "New knowledge isn't trained yet.")}
        </p>
      )}
      <div className="mt-auto pt-3">
        <Button href={CUSTOMER_ROUTES.AI_AGENT_DETAIL(agent.id)} variant="secondary" size="sm" fullWidth>
          Open agent
        </Button>
      </div>
    </Card>
  );
}

function Connections({
  connections,
  onAdd,
  onEdit,
}: {
  connections: Connection[];
  onAdd: () => void;
  onEdit: (c: Connection) => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [checking, setChecking] = useState<number | null>(null);

  const check = async (c: Connection) => {
    setChecking(c.id);
    try {
      const res = await aiAgentApi.checkConnection(c.id);
      await qc.invalidateQueries({ queryKey: AI_QK.ALL });
      if (res.data.status === "ok") toast.success(`${c.label}: the key works`);
      else toast.error(res.data.error ?? "The key didn't work");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(null);
    }
  };
  const remove = async (c: Connection) => {
    const ok = await confirm({
      title: `Remove ${c.label}?`,
      message: c.used_by
        ? `${c.used_by} agent${c.used_by > 1 ? "s use" : " uses"} this key and will stop answering until you pick another one.`
        : "The key is deleted from ChatDesk.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await aiAgentApi.removeConnection(c.id);
      await qc.invalidateQueries({ queryKey: AI_QK.ALL });
      toast.success("AI connection removed");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader
        icon={KeyRound}
        title="AI connections"
        description="Your own keys for Claude, ChatGPT, Gemini and others. Encrypted, never shown again."
        actions={
          <Button size="sm" variant="secondary" leftIcon={Plus} onClick={onAdd}>
            Add key
          </Button>
        }
      />
      {connections.length === 0 ? (
        <p className="text-fg-subtle px-5 pb-5 text-sm">No AI keys yet.</p>
      ) : (
        <ul className="divide-line divide-y" aria-label="AI connections">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <ProviderMark provider={c.provider} />
              <div className="min-w-0 flex-1">
                <p className="text-fg flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{c.label}</span>
                  {c.status === "ok" ? (
                    <Badge tone="success" dot>
                      Working
                    </Badge>
                  ) : c.status === "failed" ? (
                    <Badge tone="danger" dot>
                      Not working
                    </Badge>
                  ) : (
                    <Badge>Not checked</Badge>
                  )}
                </p>
                <p className="text-fg-subtle truncate text-xs">
                  {c.provider_label} · {c.key_hint} · {c.models.length} models · used by {c.used_by} agent
                  {c.used_by === 1 ? "" : "s"}
                  {c.checked_at ? ` · checked ${timeAgo(c.checked_at)}` : ""}
                </p>
                {c.status === "failed" && c.error && <p className="text-danger mt-0.5 text-xs">{c.error}</p>}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={RefreshCw}
                  loading={checking === c.id}
                  onClick={() => check(c)}
                >
                  Check
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Pencil}
                  aria-label={`Edit ${c.label}`}
                  onClick={() => onEdit(c)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Trash2}
                  aria-label={`Remove ${c.label}`}
                  onClick={() => remove(c)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Onboarding({ onConnect }: { onConnect: () => void }) {
  const providers = useProviders().data ?? [];
  const steps = [
    {
      icon: KeyRound,
      title: "Connect an AI",
      text: "Paste a key from Claude, ChatGPT, Gemini or any other provider.",
    },
    {
      icon: FileText,
      title: "Teach it your business",
      text: "Upload PDFs, Word or Excel files, add your website and FAQs.",
    },
    {
      icon: MessageCircle,
      title: "Go live",
      text: "Turn it on for WhatsApp, or paste one line on your website.",
    },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="from-primary-soft grid gap-6 bg-gradient-to-br to-transparent p-6 lg:grid-cols-[1.1fr_1fr] lg:p-8">
        <div>
          <Badge tone="brand">
            <Sparkles className="h-3 w-3" aria-hidden /> AI agent
          </Badge>
          <h2 className="text-fg mt-3 text-2xl font-bold tracking-tight">
            An assistant that knows your business
          </h2>
          <p className="text-fg-subtle mt-2 max-w-lg text-sm">
            It answers customers 24/7 on WhatsApp and your website from your own documents, remembers the
            whole conversation, replies in their language and hands over to your team when it isn&apos;t sure.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button leftIcon={KeyRound} onClick={onConnect}>
              Connect an AI provider
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {providers.slice(0, 7).map((p) => (
              <span key={p.key} className="text-fg-subtle inline-flex items-center gap-1.5 text-xs">
                <ProviderMark provider={p.key} size="sm" /> {p.label}
              </span>
            ))}
          </div>
        </div>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="border-line bg-surface flex gap-3 rounded-xl border p-3.5">
              <span className="bg-primary text-primary-fg flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {i + 1}
              </span>
              <span>
                <span className="text-fg flex items-center gap-1.5 text-sm font-semibold">
                  <s.icon className="text-primary h-4 w-4" aria-hidden /> {s.title}
                </span>
                <span className="text-fg-subtle block text-xs">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

export function AiAgents() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const router = useRouter();
  const connections = useConnections();
  const agents = useQuery({ queryKey: AI_QK.AGENTS, queryFn: () => aiAgentApi.agents().then((r) => r.data) });
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const list = agents.data ?? [];
  const keys = connections.data ?? [];
  const totals = list.reduce(
    (t, a) => ({
      replies: t.replies + (a.stats.replies ?? 0),
      cost: t.cost + (a.stats.cost ?? 0),
      handovers: t.handovers + (a.stats.handovers ?? 0),
      conversations: t.conversations + (a.stats.conversations ?? 0),
    }),
    { replies: 0, cost: 0, handovers: 0, conversations: 0 }
  );

  const duplicate = async (a: AgentSummary) => {
    try {
      const res = await aiAgentApi.duplicate(a.id);
      await qc.invalidateQueries({ queryKey: AI_QK.AGENTS });
      toast.success("Agent duplicated with all its knowledge");
      router.push(CUSTOMER_ROUTES.AI_AGENT_DETAIL(res.data.id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const remove = async (a: AgentSummary) => {
    const ok = await confirm({
      title: `Delete ${a.name}?`,
      message: "Its knowledge, conversations and website script stop working. This can't be undone.",
      confirmLabel: "Delete agent",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await aiAgentApi.remove(a.id);
      await qc.invalidateQueries({ queryKey: AI_QK.AGENTS });
      toast.success("AI agent deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const loading = agents.isLoading || connections.isLoading;
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Sparkles}
        title="AI agent"
        description="AI assistants trained on your documents, website and FAQs. They answer on WhatsApp, your website or through the API."
        actions={
          keys.length > 0 ? (
            <Button leftIcon={Plus} onClick={() => setCreating(true)}>
              New agent
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : keys.length === 0 && list.length === 0 ? (
        <Onboarding onConnect={() => setConnecting(true)} />
      ) : (
        <>
          {list.length > 0 && (
            <KpiGrid cols={4}>
              <KpiTile icon={Bot} tone="indigo" label="AI agents" value={list.length} />
              <KpiTile
                icon={MessageCircle}
                tone="green"
                label="Replies · 30 days"
                value={compact.format(totals.replies)}
                hint={`${compact.format(totals.conversations)} conversations`}
              />
              <KpiTile
                icon={UserRoundCheck}
                tone="amber"
                label="Handed to team"
                value={compact.format(totals.handovers)}
                hint={
                  totals.replies
                    ? `${Math.round((100 * totals.handovers) / totals.replies)}% of replies`
                    : undefined
                }
              />
              <KpiTile
                icon={Wallet}
                tone="purple"
                label="AI cost · 30 days"
                value={usd(totals.cost)}
                hint="Billed by your provider"
              />
            </KpiGrid>
          )}
          {list.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="bg-primary-soft text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
                <Sparkles className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="text-fg text-lg font-semibold">Create your first AI agent</h2>
              <p className="text-fg-subtle max-w-md text-sm">
                Your AI key is connected. Now create an agent and teach it about your business.
              </p>
              <Button leftIcon={Plus} onClick={() => setCreating(true)}>
                New agent
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="AI agents">
              {list.map((a) => (
                <AgentCard key={a.id} agent={a} onDuplicate={() => duplicate(a)} onDelete={() => remove(a)} />
              ))}
            </div>
          )}
          <Connections connections={keys} onAdd={() => setConnecting(true)} onEdit={setEditing} />
        </>
      )}
      {creating && <NewAgentModal open onClose={() => setCreating(false)} />}
      {(connecting || editing) && (
        <ConnectionModal
          open
          editing={editing}
          onClose={() => {
            setConnecting(false);
            setEditing(null);
          }}
          onSaved={() => {
            if (!list.length && !editing) setCreating(true);
          }}
        />
      )}
    </div>
  );
}
