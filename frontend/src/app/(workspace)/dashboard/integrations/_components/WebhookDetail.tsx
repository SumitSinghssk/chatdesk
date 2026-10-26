"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Eye, EyeOff, RefreshCw, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Badge, Button, EmptyState, Modal, Select, Skeleton, Tabs } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { INTEGRATIONS_QK, integrationsApi, type Delivery } from "../../_lib/integrationsApi";
import { CopyButton } from "./KeysTab";

type Filter = "all" | "success" | "failed" | "pending";
const STATUS = {
  success: { tone: "success", label: "Delivered" },
  failed: { tone: "danger", label: "Failed" },
  pending: { tone: "warning", label: "Retrying" },
} as const;

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-fg text-sm font-semibold">{title}</h3>
        {hint && <p className="text-fg-subtle mt-0.5 text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Json({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="bg-page border-line text-fg max-h-72 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
      {text || "(empty)"}
    </pre>
  );
}

function DeliveryRow({ webhookId, d, onChanged }: { webhookId: number; d: Delivery; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: full } = useQuery({
    queryKey: ["integrations", "delivery", d.id, d.attempts],
    queryFn: async () => (await integrationsApi.delivery(webhookId, d.id)).data,
    enabled: open,
  });
  const resend = async () => {
    setBusy(true);
    try {
      const res = await integrationsApi.resend(webhookId, d.id);
      if (res.data.status === "success") toast.success(res.message ?? "Delivered");
      else toast.error(res.message ?? "Failed");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const s = STATUS[d.status];
  return (
    <li className="border-line rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-hover flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition"
      >
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
        <code className="text-fg min-w-0 flex-1 truncate font-mono text-xs">{d.event}</code>
        <span className="text-fg-subtle hidden text-xs sm:inline">
          {d.response_status ? `HTTP ${d.response_status}` : d.error ? "No answer" : ""}
        </span>
        <span className="text-fg-subtle text-xs whitespace-nowrap" title={formatDateTime(d.created_at)}>
          {timeAgo(d.created_at)}
        </span>
        <ChevronDown className={cn("text-fg-faint h-4 w-4 shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-line space-y-3 border-t px-3 py-3">
          <dl className="text-fg-subtle grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt>Tries</dt>
              <dd className="text-fg font-medium">{d.attempts}</dd>
            </div>
            <div>
              <dt>Answer</dt>
              <dd className="text-fg font-medium">{d.response_status ?? "—"}</dd>
            </div>
            <div>
              <dt>Time taken</dt>
              <dd className="text-fg font-medium">{d.duration_ms != null ? `${d.duration_ms} ms` : "—"}</dd>
            </div>
            <div>
              <dt>{d.status === "pending" ? "Next try" : "Last try"}</dt>
              <dd className="text-fg font-medium">
                {formatDateTime(d.status === "pending" ? d.next_attempt_at : d.last_attempt_at)}
              </dd>
            </div>
          </dl>
          {d.error && <p className="text-danger text-xs">{d.error}</p>}
          {full ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="text-fg-subtle mb-1 text-xs font-medium">What we sent</p>
                <Json value={full.payload} />
              </div>
              <div className="min-w-0">
                <p className="text-fg-subtle mb-1 text-xs font-medium">What your server answered</p>
                <Json value={full.response_body ?? ""} />
              </div>
            </div>
          ) : (
            <Skeleton className="h-24 rounded-lg" />
          )}
          <Button size="sm" variant="secondary" leftIcon={RotateCcw} loading={busy} onClick={resend}>
            Send again
          </Button>
        </div>
      )}
    </li>
  );
}

export function WebhookDetail({ id, onClose }: { id: number | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [reveal, setReveal] = useState(false);
  const [testEvent, setTestEvent] = useState("message.received");
  const [testing, setTesting] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [pages, setPages] = useState(1);

  const { data: hook } = useQuery({
    queryKey: INTEGRATIONS_QK.WEBHOOK(id ?? 0),
    queryFn: async () => (await integrationsApi.webhook(id!)).data,
    enabled: id !== null,
  });
  const { data: events } = useQuery({
    queryKey: INTEGRATIONS_QK.EVENTS,
    queryFn: async () => (await integrationsApi.events()).data,
    staleTime: 600_000,
  });
  const { data: deliveries, isFetching } = useQuery({
    queryKey: INTEGRATIONS_QK.DELIVERIES(id ?? 0, filter, pages),
    queryFn: async () => {
      const all: Delivery[] = [];
      for (let p = 1; p <= pages; p++) all.push(...(await integrationsApi.deliveries(id!, filter, p)).data);
      return all;
    },
    enabled: id !== null,
    refetchInterval: 15_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["integrations"] });

  const sendTest = async () => {
    if (!id) return;
    setTesting(true);
    try {
      const res = await integrationsApi.test(id, testEvent);
      if (res.data.status === "success") toast.success(res.message ?? "Delivered");
      else toast.error(res.message ?? "Test failed");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };
  const roll = async () => {
    if (!id) return;
    const ok = await confirm({
      title: "Make a new signing secret?",
      message: "The current secret stops working at once. Update your app with the new one straight away.",
      confirmLabel: "Make new secret",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await integrationsApi.rollSecret(id);
      toast.success(res.message ?? "Done");
      setReveal(true);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const secret = hook?.secret ?? "";
  return (
    <Modal
      open={id !== null}
      onClose={onClose}
      variant="drawer"
      size="lg"
      title="Webhook"
      description={hook ? <span className="font-mono text-xs break-all">{hook.url}</span> : undefined}
    >
      {!hook ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <div className="space-y-6">
          <Section
            title="Signing secret"
            hint="Use it to check that a call really came from ChatDesk (the X-ChatDesk-Signature header)."
          >
            <div className="flex flex-wrap gap-2">
              <code className="border-line bg-page text-fg min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-xs">
                {reveal ? secret : `${secret.slice(0, 10)}${"•".repeat(24)}`}
              </code>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={reveal ? EyeOff : Eye}
                onClick={() => setReveal((v) => !v)}
              >
                {reveal ? "Hide" : "Show"}
              </Button>
              <CopyButton value={secret} />
              <Button variant="ghost" size="sm" leftIcon={RefreshCw} onClick={roll}>
                New secret
              </Button>
            </div>
            <a
              href={`${CUSTOMER_ROUTES.DOCS()}/webhooks/verify-signatures`}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-xs hover:underline"
            >
              How to check the signature, with code
            </a>
          </Section>

          <Section
            title="Send a test event"
            hint="Sends a sample event now and shows what your server answered."
          >
            <div className="flex flex-wrap items-end gap-2">
              <Select
                aria-label="Event to test"
                size="sm"
                wrapperClassName="min-w-56 flex-1"
                options={(events ?? []).map((e) => ({ value: e.event, label: e.event }))}
                value={testEvent}
                onChange={setTestEvent}
              />
              <Button size="sm" leftIcon={Send} loading={testing} onClick={sendTest}>
                Send test
              </Button>
            </div>
          </Section>

          <Section
            title="Recent deliveries"
            hint="Kept for 30 days. Failed calls are retried 6 times over about 21 hours."
          >
            <Tabs<Filter>
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPages(1);
              }}
              tabs={[
                { value: "all", label: "All" },
                { value: "success", label: "Delivered", count: hook.counts.success },
                { value: "failed", label: "Failed", count: hook.counts.failed },
                { value: "pending", label: "Retrying", count: hook.counts.pending },
              ]}
            />
            {!deliveries ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : deliveries.length === 0 ? (
              <EmptyState
                icon={Send}
                title="Nothing sent yet"
                description="Send a test event, or wait for something to happen on your number."
              />
            ) : (
              <>
                <ul className="space-y-2">
                  {deliveries.map((d) => (
                    <DeliveryRow key={d.id} webhookId={hook.id} d={d} onChanged={refresh} />
                  ))}
                </ul>
                {deliveries.length === pages * 20 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={isFetching}
                    onClick={() => setPages((p) => p + 1)}
                  >
                    Show more
                  </Button>
                )}
              </>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}
