"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, Layers, RefreshCw, Save, ScanText } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Input, Modal, Skeleton, Tabs, Textarea } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { formatBytes, timeAgo } from "@/lib/utils";

import { AI_QK, aiAgentApi, compact, SOURCE_LABELS, type Source } from "../../../_lib/aiAgentApi";

type View = "original" | "text" | "passages" | "edit";

function useFileUrl(agentId: number, source: Source, enabled: boolean) {
  const query = useQuery({
    queryKey: [...AI_QK.SOURCE(agentId, source.id), "file", source.updated_at],
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async () => {
      const res = await fetch(aiAgentApi.sourceFileUrl(agentId, source.id), { credentials: "same-origin" });
      if (!res.ok) throw new Error("The original file couldn't be loaded.");
      return URL.createObjectURL(await res.blob());
    },
  });
  const url = query.data;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );
  return query;
}

/** See exactly what the agent read from a source: the original file, its text and its passages. */
export function SourcePreview({
  agentId,
  source,
  onClose,
}: {
  agentId: number;
  source: Source;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editable = source.kind === "text" || source.kind === "faq";
  const isPdf = source.mime === "application/pdf";
  const [view, setView] = useState<View>(editable ? "edit" : isPdf ? "original" : "text");
  const detail = useQuery({
    queryKey: AI_QK.SOURCE(agentId, source.id),
    queryFn: () => aiAgentApi.source(agentId, source.id).then((r) => r.data),
  });
  const file = useFileUrl(agentId, source, source.has_file && isPdf);
  const [title, setTitle] = useState(source.title);
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const d = detail.data;
  const body = content ?? d?.content ?? "";

  const save = async () => {
    setSaving(true);
    try {
      await aiAgentApi.updateSource(agentId, source.id, { title: title.trim(), content: body.trim() });
      await qc.invalidateQueries({ queryKey: AI_QK.AGENT(agentId) });
      toast.success("Saved. Train the agent to use the change.");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await aiAgentApi.refreshSource(agentId, source.id);
      await qc.invalidateQueries({ queryKey: AI_QK.AGENT(agentId) });
      if (res.data.status === "ready") toast.success("Page read again. Train the agent to use it.");
      else toast.error(res.data.error ?? "The page couldn't be read");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const tabs = [
    ...(editable ? [{ value: "edit" as View, label: "Edit" }] : []),
    ...(isPdf && source.has_file ? [{ value: "original" as View, label: "Original" }] : []),
    ...(!editable ? [{ value: "text" as View, label: "Text read" }] : []),
    { value: "passages" as View, label: "Passages", count: d?.chunks.length },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={source.title}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge>{SOURCE_LABELS[source.kind]}</Badge>
          {source.filename && <span>{source.filename}</span>}
          {source.size ? <span>{formatBytes(source.size)}</span> : null}
          {source.pages ? <span>{source.pages} pages</span> : null}
          <span>≈ {compact.format(source.tokens)} tokens</span>
          <span>
            added {timeAgo(source.created_at)}
            {source.created_by ? ` by ${source.created_by}` : ""}
          </span>
        </span>
      }
      headerActions={
        <>
          {source.kind === "url" && source.url && (
            <>
              <Button size="sm" variant="ghost" leftIcon={RefreshCw} loading={refreshing} onClick={refresh}>
                Read again
              </Button>
              <Button size="sm" variant="ghost" leftIcon={ExternalLink} href={source.url} target="_blank">
                Open page
              </Button>
            </>
          )}
          {source.has_file && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={Download}
              href={aiAgentApi.sourceFileUrl(agentId, source.id)}
              target="_blank"
            >
              Download
            </Button>
          )}
        </>
      }
      bodyClassName="flex min-h-0 flex-col"
      footer={
        view === "edit" ? (
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button leftIcon={Save} onClick={save} loading={saving} disabled={!title.trim() || !body.trim()}>
              Save
            </Button>
          </div>
        ) : undefined
      }
    >
      <Tabs tabs={tabs} value={view} onChange={setView} className="mb-3" />
      {detail.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : view === "edit" ? (
        <div className="space-y-3">
          <Input
            label={source.kind === "faq" ? "Question" : "Title"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label={source.kind === "faq" ? "Answer" : "Text"}
            rows={14}
            value={body}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
      ) : view === "original" ? (
        file.isLoading ? (
          <Skeleton className="h-[70vh] rounded-xl" />
        ) : file.data ? (
          <iframe
            title={`${source.title} (original)`}
            src={file.data}
            className="border-line h-[70vh] w-full rounded-xl border bg-white"
          />
        ) : (
          <p className="text-danger text-sm">{(file.error as Error)?.message}</p>
        )
      ) : view === "text" ? (
        <div className="border-line bg-surface-2 max-h-[70vh] overflow-auto rounded-xl border p-4">
          <p className="text-fg-subtle mb-3 flex items-center gap-1.5 text-xs">
            <ScanText className="h-3.5 w-3.5" aria-hidden /> This is the text the agent learned from. It was
            read once, when the file was added.
          </p>
          <pre className="text-fg font-sans text-sm leading-relaxed whitespace-pre-wrap">{d?.content}</pre>
        </div>
      ) : (
        <div className="max-h-[70vh] space-y-2 overflow-auto">
          {!d?.chunks.length ? (
            <p className="text-fg-subtle flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4" aria-hidden />
              {source.enabled
                ? "Train the agent to cut this into searchable passages."
                : "This source is switched off."}
            </p>
          ) : (
            <>
              <p className="text-fg-subtle text-xs">
                The agent searches these passages and sends only the ones that match a question (or all of
                them when the knowledge is small).
              </p>
              {d.chunks.map((c) => (
                <article key={c.position} className="border-line rounded-xl border p-3">
                  <p className="text-fg-subtle mb-1 flex items-center gap-2 text-[11px] font-medium">
                    <FileText className="h-3 w-3" aria-hidden /> Passage {c.position + 1}
                    {c.heading && <span className="text-fg truncate">· {c.heading}</span>}
                    <span className="ml-auto tabular-nums">≈ {c.tokens} tokens</span>
                  </p>
                  <p className="text-fg text-sm whitespace-pre-wrap">{c.text}</p>
                </article>
              ))}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
