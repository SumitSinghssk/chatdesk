"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Badge, Button, EmptyState, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { timeAgo } from "@/lib/utils";

import { INTEGRATIONS_QK, integrationsApi, type Webhook } from "../../_lib/integrationsApi";
import { WebhookDetail } from "./WebhookDetail";
import { WebhookModal } from "./WebhookModal";

const HEALTH = {
  ok: { tone: "success", label: "Working" },
  failing: { tone: "danger", label: "Failing" },
  new: { tone: "neutral", label: "No calls yet" },
} as const;

export function WebhooksTab() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);
  const { data: hooks, isLoading } = useQuery({
    queryKey: INTEGRATIONS_QK.WEBHOOKS,
    queryFn: async () => (await integrationsApi.webhooks()).data,
    refetchInterval: 30_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QK.ALL });

  const setEnabled = async (w: Webhook, enabled: boolean) => {
    try {
      await integrationsApi.saveWebhook(
        { url: w.url, description: w.description, events: w.events, enabled },
        w.id
      );
      toast.success(enabled ? "Webhook turned on" : "Webhook paused: nothing is sent to it");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const remove = async (w: Webhook) => {
    const ok = await confirm({
      title: "Delete this webhook?",
      message: `ChatDesk stops calling ${w.url}. Its delivery log is deleted too.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await integrationsApi.deleteWebhook(w.id);
      toast.success("Webhook deleted");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-fg-subtle max-w-2xl text-sm">
          Webhooks tell your own system the moment something happens, such as a new message, a message read or
          a new order. Perfect for CRMs, Zapier, Make and your own backend.{" "}
          <a
            href={`${CUSTOMER_ROUTES.DOCS()}/webhooks`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Webhook guide
          </a>
        </p>
        <Button leftIcon={Plus} onClick={() => setAdding(true)}>
          Add webhook
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : !hooks?.length ? (
        <EmptyState
          icon={WebhookIcon}
          title="No webhooks yet"
          description="Add your server's URL and pick the events it should hear about."
          action={
            <Button leftIcon={Plus} onClick={() => setAdding(true)}>
              Add webhook
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {hooks.map((w) => {
            const health = w.enabled ? HEALTH[w.health] : { tone: "neutral" as const, label: "Paused" };
            return (
              <li key={w.id} className="border-line rounded-xl border">
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <WebhookIcon className="h-4 w-4" aria-hidden />
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpened(w.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open webhook ${w.url}`}
                  >
                    <p className="text-fg truncate font-mono text-xs font-semibold sm:text-sm">{w.url}</p>
                    <p className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <Badge tone={health.tone} dot>
                        {health.label}
                      </Badge>
                      {w.description && <span>{w.description}</span>}
                      <span>
                        {w.events.includes("*")
                          ? "All events"
                          : `${w.events.length} event${w.events.length === 1 ? "" : "s"}`}
                      </span>
                      <span>
                        {w.counts.success} delivered · {w.counts.failed} failed
                      </span>
                      {w.last_delivery?.at && <span>Last call {timeAgo(w.last_delivery.at)}</span>}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={w.enabled}
                      onChange={(on) => setEnabled(w, on)}
                      size="sm"
                      aria-label={w.enabled ? "Pause webhook" : "Turn webhook on"}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      leftIcon={Pencil}
                      aria-label="Edit webhook"
                      onClick={() => setEditing(w)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      leftIcon={Trash2}
                      className="text-danger hover:text-danger"
                      aria-label="Delete webhook"
                      onClick={() => remove(w)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpened(w.id)}
                  className="border-line text-primary hover:bg-hover w-full rounded-b-xl border-t px-4 py-2 text-left text-xs font-medium transition"
                >
                  Signing secret, test events and delivery log →
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(adding || editing) && (
        <WebhookModal
          key={editing?.id ?? "new"}
          open
          webhook={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={(w) => {
            const isNew = !editing;
            setAdding(false);
            setEditing(null);
            refresh();
            if (isNew) setOpened(w.id); // straight to its secret and a test
          }}
        />
      )}
      <WebhookDetail key={opened ?? "none"} id={opened} onClose={() => setOpened(null)} />
    </div>
  );
}
