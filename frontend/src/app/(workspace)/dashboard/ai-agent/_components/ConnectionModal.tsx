"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button, ErrorBanner, Input, Modal } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { AI_QK, aiAgentApi, type Connection, type Provider, type ProviderKey } from "../../_lib/aiAgentApi";
import { ProviderMark } from "./ProviderMark";

export function useProviders() {
  return useQuery({
    queryKey: AI_QK.PROVIDERS,
    queryFn: () => aiAgentApi.providers().then((r) => r.data),
    staleTime: Infinity,
  });
}

/** Add or edit an AI provider key: pick the provider, paste the key, we check it right away. */
export function ConnectionModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Connection | null;
  onSaved?: (c: Connection) => void;
}) {
  const qc = useQueryClient();
  const providers = useProviders().data ?? [];
  const [provider, setProvider] = useState<ProviderKey | null>(editing?.provider ?? null);
  const [label, setLabel] = useState(editing?.label ?? "");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(editing?.base_url ?? "");
  const [advanced, setAdvanced] = useState(!!editing?.base_url && editing.provider !== "custom");
  const [priceModel, setPriceModel] = useState(Object.keys(editing?.prices ?? {})[0] ?? "");
  const [priceIn, setPriceIn] = useState(String(Object.values(editing?.prices ?? {})[0]?.[0] ?? ""));
  const [priceOut, setPriceOut] = useState(String(Object.values(editing?.prices ?? {})[0]?.[1] ?? ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const info: Provider | undefined = providers.find((p) => p.key === provider);

  const save = async () => {
    if (!provider) return;
    setSaving(true);
    setErrors({});
    setFailed(null);
    const prices =
      priceModel.trim() && priceIn && priceOut
        ? { [priceModel.trim()]: [Number(priceIn), Number(priceOut)] as [number, number] }
        : {};
    const body = {
      provider,
      label: label.trim(),
      api_key: key.trim() || null,
      base_url: provider === "custom" || advanced ? baseUrl.trim() || null : null,
      prices,
    };
    try {
      const res = editing
        ? await aiAgentApi.editConnection(editing.id, body)
        : await aiAgentApi.addConnection(body);
      await qc.invalidateQueries({ queryKey: AI_QK.ALL });
      if (res.data.status === "failed") {
        setFailed(res.data.error);
        toast.error("Saved, but the key didn't work");
        return;
      }
      toast.success(`${res.data.label} connected · ${res.data.models.length} models available`);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      variant="modal"
      title={
        editing ? "Edit AI connection" : provider ? `Connect ${info?.label ?? ""}` : "Connect an AI provider"
      }
      description={
        provider
          ? "Your key is encrypted and only used for your own AI agents. You pay the provider directly."
          : "Bring your own key from any AI company. You can add several and switch any time."
      }
      footer={
        provider ? (
          <div className="flex w-full items-center justify-between gap-2">
            {!editing ? (
              <Button variant="ghost" leftIcon={ArrowLeft} onClick={() => setProvider(null)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={save}
                loading={saving}
                leftIcon={ShieldCheck}
                disabled={!editing && !key.trim()}
              >
                {editing ? "Save and check" : "Connect and check"}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {!provider ? (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="AI providers">
          {providers.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => {
                  setProvider(p.key);
                  setLabel("");
                }}
                className="border-line hover:border-primary/50 hover:bg-hover flex w-full items-start gap-3 rounded-xl border p-3 text-left transition"
              >
                <ProviderMark provider={p.key} />
                <span className="min-w-0">
                  <span className="text-fg block text-sm font-semibold">{p.label}</span>
                  <span className="text-fg-subtle block text-xs">{p.company}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          <div className="border-line bg-surface-2 flex items-center gap-3 rounded-xl border p-3">
            <ProviderMark provider={provider} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-fg text-sm font-semibold">
                {info?.label} <span className="text-fg-subtle font-normal">· {info?.company}</span>
              </p>
              {info?.hint && <p className="text-fg-subtle text-xs">{info.hint}</p>}
            </div>
            {info?.keys_url && (
              <a
                href={info.keys_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex shrink-0 items-center gap-1 text-xs font-medium hover:underline"
              >
                Get a key <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
          <Input
            label="API key"
            type="password"
            autoComplete="off"
            leftIcon={KeyRound}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              editing ? `Saved: ${editing.key_hint} (leave empty to keep it)` : `${info?.prefix || ""}…`
            }
            error={errors.api_key}
            required={!editing}
          />
          <Input
            label="Name (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`e.g. ${info?.label} – main account`}
          />
          {provider === "custom" || advanced ? (
            <Input
              label="API address (base URL)"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={info?.base_url ?? "https://api.together.xyz/v1"}
              hint="The address that ends before /chat/completions."
              error={errors.base_url}
              required={provider === "custom"}
            />
          ) : (
            <button
              type="button"
              className="text-fg-subtle hover:text-fg text-xs underline-offset-2 hover:underline"
              onClick={() => setAdvanced(true)}
            >
              Use a different API address (proxy, Azure, regional endpoint)
            </button>
          )}
          {provider !== "anthropic" && (
            <fieldset className="border-line rounded-xl border p-3">
              <legend className="text-fg px-1 text-xs font-semibold">Price (optional)</legend>
              <p className="text-fg-subtle mb-2 text-xs">
                To see what replies cost, enter the model&apos;s price in USD per 1 million tokens.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_96px_96px]">
                <Input
                  aria-label="Model"
                  placeholder="Model id"
                  value={priceModel}
                  onChange={(e) => setPriceModel(e.target.value)}
                />
                <Input
                  aria-label="Input price"
                  placeholder="Input $"
                  inputMode="decimal"
                  value={priceIn}
                  onChange={(e) => setPriceIn(e.target.value)}
                />
                <Input
                  aria-label="Output price"
                  placeholder="Output $"
                  inputMode="decimal"
                  value={priceOut}
                  onChange={(e) => setPriceOut(e.target.value)}
                />
              </div>
            </fieldset>
          )}
          {failed && <ErrorBanner message={failed} />}
          {editing?.status === "ok" && !failed && (
            <p className={cn("text-success flex items-center gap-1.5 text-xs")}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> The saved key works (
              {editing.models.length} models)
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
