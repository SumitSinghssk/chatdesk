"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, RefreshCw, Search, SendHorizontal } from "lucide-react";

import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { INBOX_QK, inboxApi, type MessageTemplate } from "../../_lib/inboxApi";

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

function fill(text: string, names: string[], values: string[]) {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const i = names.indexOf(name);
    return i >= 0 && values[i] ? values[i] : whole;
  });
}

export function TemplateModal({
  open,
  contactName,
  onClose,
  onSend,
}: {
  open: boolean;
  contactName: string;
  onClose: () => void;
  onSend: (t: MessageTemplate, body: string[], header: string[]) => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState<string[]>([]);
  const [header, setHeader] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    enabled: open,
    staleTime: 60_000,
  });

  const templates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((t) => !q || `${t.name} ${t.body}`.toLowerCase().includes(q));
  }, [data, search]);
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const choose = (t: MessageTemplate) => {
    setSelectedId(t.id);
    setBody(t.body_params.map(() => ""));
    setHeader(t.header_params.map(() => ""));
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      queryClient.setQueryData(INBOX_QK.TEMPLATES, (await inboxApi.templates(true)).data);
    } finally {
      setRefreshing(false);
    }
  };

  const complete = !!selected && body.every((v) => v.trim()) && header.every((v) => v.trim());
  const send = async () => {
    if (!selected || !complete) return;
    setSending(true);
    const ok = await onSend(
      selected,
      body.map((v) => v.trim()),
      header.map((v) => v.trim())
    );
    setSending(false);
    if (ok) {
      setSelectedId(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Send a template"
      description={`Approved WhatsApp templates can be sent to ${contactName} at any time, even after the 24-hour window.`}
      headerActions={
        <Button variant="ghost" size="sm" leftIcon={RefreshCw} loading={refreshing} onClick={refresh}>
          Refresh
        </Button>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon={SendHorizontal} disabled={!complete} loading={sending} onClick={send}>
            Send template
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorBanner message={errorMessage(error)} />
      ) : (
        <div className="grid min-h-80 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <Input
              leftIcon={Search}
              placeholder="Search templates"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search templates"
            />
            <div className="border-line max-h-96 min-h-0 flex-1 overflow-y-auto rounded-lg border">
              {isLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : templates.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={search ? "No templates match" : "No approved templates"}
                  description={
                    search
                      ? "Try another word."
                      : "Create templates in WhatsApp Manager. Only approved ones appear here."
                  }
                />
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => choose(t)}
                    disabled={!t.supported}
                    title={t.unsupported_reason ?? undefined}
                    className={cn(
                      "border-line/70 block w-full border-b px-3 py-2.5 text-left transition last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50",
                      t.id === selectedId ? "bg-primary-soft" : "hover:bg-hover"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-fg min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
                      <Badge>{t.language}</Badge>
                      {t.category && <Badge tone="info">{t.category.toLowerCase()}</Badge>}
                    </span>
                    <span className="text-fg-subtle mt-0.5 line-clamp-2 block text-xs">
                      {t.supported ? t.body : t.unsupported_reason}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="min-w-0">
            {!selected ? (
              <div className="border-line text-fg-subtle flex h-full min-h-60 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
                Pick a template to preview it and fill in its variables.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-[#efeae2] p-4 dark:bg-[#0b141a]">
                  <div className="max-w-sm rounded-xl rounded-tl-sm bg-white p-3 text-[13.5px] text-slate-900 shadow-xs dark:bg-[#202c33] dark:text-white">
                    {selected.header?.text && (
                      <p className="mb-1 font-semibold">
                        {fill(selected.header.text, selected.header_params, header)}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{fill(selected.body, selected.body_params, body)}</p>
                    {selected.footer && <p className="mt-1 text-xs opacity-60">{selected.footer}</p>}
                    {selected.buttons.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-black/10 pt-2 dark:border-white/10">
                        {selected.buttons.map((b, i) => (
                          <p
                            key={i}
                            className="text-center text-[13px] font-medium text-sky-600 dark:text-sky-400"
                          >
                            {b.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {selected.header_params.map((name, i) => (
                  <Input
                    key={`h-${name}`}
                    label={`Header variable {{${name}}}`}
                    name={`header_param_${i}`}
                    value={header[i] ?? ""}
                    onChange={(e) => setHeader(header.map((v, j) => (j === i ? e.target.value : v)))}
                  />
                ))}
                {selected.body_params.map((name, i) => (
                  <Input
                    key={`b-${name}`}
                    label={`Variable {{${name}}}`}
                    name={`body_param_${i}`}
                    placeholder={i === 0 ? contactName : undefined}
                    value={body[i] ?? ""}
                    onChange={(e) => setBody(body.map((v, j) => (j === i ? e.target.value : v)))}
                  />
                ))}
                {!selected.body_params.length && !selected.header_params.length && (
                  <p className="text-fg-subtle text-xs">
                    This template has no variables. It&apos;s ready to send.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
