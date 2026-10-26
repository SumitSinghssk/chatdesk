"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, EmptyState, Input, Modal, Skeleton } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { useDashboard } from "../../_components/DashboardContext";
import { INTEGRATIONS_QK, integrationsApi, type ApiKey } from "../../_lib/integrationsApi";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={copied ? Check : Copy}
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => null);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function NewKeyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState<ApiKey | null>(null);
  const close = () => {
    setName("");
    setError(undefined);
    setMade(null);
    onClose();
  };
  const create = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const res = await integrationsApi.createKey(name);
      setMade(res.data);
      void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QK.KEYS });
    } catch (err) {
      if (err instanceof CustomerApiError) setError(err.errors.name);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      closeOnBackdrop={!made}
      title={made ? "Your new API key" : "Create an API key"}
      description={made ? undefined : "Give it a name you'll recognise, like the app that will use it."}
      footer={
        made ? (
          <Button onClick={close}>I&apos;ve saved it</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button leftIcon={KeyRound} loading={saving} disabled={!name.trim()} onClick={create}>
              Create key
            </Button>
          </>
        )
      }
    >
      {made?.key ? (
        <div className="space-y-4">
          <div className="border-warning/30 bg-warning-soft text-fg flex gap-2.5 rounded-lg border p-3 text-sm">
            <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Copy this key now and keep it somewhere safe. For your security we only show it{" "}
              <strong>once</strong>. Anyone with it can send messages from your number.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={made.key}
              aria-label="API key"
              onFocus={(e) => e.target.select()}
              className="border-line bg-page text-fg min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs"
            />
            <CopyButton value={made.key} />
          </div>
          <div>
            <p className="text-fg-subtle mb-1.5 text-xs font-medium">Try it: check the key works</p>
            <pre className="bg-page border-line text-fg overflow-x-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
              {`curl ${origin}/api/v1/public/me \\\n  -H "Authorization: Bearer ${made.key}"`}
            </pre>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void create();
          }}
        >
          <Input
            name="key_name"
            label="Name"
            autoFocus
            required
            maxLength={60}
            placeholder="e.g. Website, Shopify app, Zapier"
            value={name}
            error={error}
            onChange={(e) => setName(e.target.value)}
          />
        </form>
      )}
    </Modal>
  );
}

export function KeysTab() {
  const { number, numbers } = useDashboard();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data: keys, isLoading } = useQuery({
    queryKey: INTEGRATIONS_QK.KEYS,
    queryFn: async () => (await integrationsApi.keys()).data,
  });

  const remove = async (k: ApiKey) => {
    const ok = await confirm({
      title: `Delete “${k.name}”?`,
      message: "Any app using this key stops working right away. This can't be undone.",
      confirmLabel: "Delete key",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await integrationsApi.deleteKey(k.id);
      toast.success(res.message ?? "Deleted");
      void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QK.KEYS });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-fg-subtle max-w-2xl text-sm">
          Your website or app uses an API key to send WhatsApp messages and manage contacts
          {numbers.length > 1 ? (
            <>
              {" "}
              from <strong className="text-fg">{number.label}</strong>. Each number has its own keys
            </>
          ) : null}
          . Keep keys secret, like a password.{" "}
          <a
            href={CUSTOMER_ROUTES.DOCS()}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            How to use the API
          </a>
        </p>
        <Button leftIcon={Plus} onClick={() => setCreating(true)}>
          Create API key
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : !keys?.length ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys yet"
          description="Create one to connect your website, your CRM or tools like Zapier and Make."
          action={
            <Button leftIcon={Plus} onClick={() => setCreating(true)}>
              Create API key
            </Button>
          }
        />
      ) : (
        <ul className="border-line divide-line divide-y rounded-xl border">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <KeyRound className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg text-sm font-semibold">{k.name}</p>
                <p className="text-fg-subtle mt-0.5 flex flex-wrap gap-x-3 text-xs">
                  <code className="font-mono">{k.hint}</code>
                  <span title={formatDateTime(k.created_at)}>
                    Created {timeAgo(k.created_at)}
                    {k.created_by ? ` by ${k.created_by}` : ""}
                  </span>
                  <span>{k.last_used_at ? `Last used ${timeAgo(k.last_used_at)}` : "Never used"}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                leftIcon={Trash2}
                className="text-danger hover:text-danger"
                aria-label={`Delete ${k.name}`}
                onClick={() => remove(k)}
              />
            </li>
          ))}
        </ul>
      )}
      <NewKeyModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
