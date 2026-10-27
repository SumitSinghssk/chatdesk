"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, Spinner, Tabs } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { DIAGRAMS_QK, diagramsApi, type Activity, type DiagramContent } from "../../../_lib/diagramsApi";

const DONE: Record<Activity["kind"], string> = {
  created: "created it",
  edited: "edited",
  commented: "commented",
  shared: "changed sharing",
  restored: "restored a version",
  viewed: "opened it",
};

/** Saved versions (preview, restore, save one now) and who did what. */
export function History({
  id,
  canEdit,
  onPreview,
  onRestored,
  onClose,
}: {
  id: number;
  canEdit: boolean;
  onPreview: (content: DiagramContent | null, label?: string) => void;
  onRestored: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"versions" | "activity">("versions");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const versions = useQuery({
    queryKey: DIAGRAMS_QK.VERSIONS(id),
    queryFn: async () => (await diagramsApi.versions(id)).data,
  });
  const activity = useQuery({
    queryKey: DIAGRAMS_QK.ACTIVITY(id),
    queryFn: async () => (await diagramsApi.activity(id)).data,
    enabled: tab === "activity",
  });

  const saveNow = async () => {
    if (!name.trim()) return;
    setBusy("save");
    try {
      await diagramsApi.saveVersion(id, name.trim());
      setName("");
      toast.success("Version saved");
      void queryClient.invalidateQueries({ queryKey: DIAGRAMS_QK.VERSIONS(id) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const preview = async (versionId: number, label: string) => {
    setBusy(`preview-${versionId}`);
    try {
      onPreview((await diagramsApi.version(id, versionId)).data.content, label);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (versionId: number, label: string) => {
    const ok = await confirm({
      title: `Restore “${label}”?`,
      message:
        "Everyone sees this version straight away. What's there now is saved as a version first, so nothing is lost.",
      confirmLabel: "Restore",
      variant: "primary",
    });
    if (!ok) return;
    setBusy(`restore-${versionId}`);
    try {
      await diagramsApi.restore(id, versionId);
      toast.success("Version restored");
      onPreview(null);
      onRestored();
      void queryClient.invalidateQueries({ queryKey: DIAGRAMS_QK.VERSIONS(id) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line flex items-center justify-between border-b px-3 py-2.5">
        <p className="text-fg text-sm font-semibold">History</p>
        <button
          type="button"
          aria-label="Close history"
          onClick={onClose}
          className="text-fg-subtle hover:bg-hover rounded-md p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 pt-1">
        <Tabs
          tabs={[
            { value: "versions", label: "Versions" },
            { value: "activity", label: "Activity" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
        />
      </div>
      {tab === "versions" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {canEdit && (
            <form
              className="mb-3 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveNow();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Name this version, e.g. Sent to client"
                aria-label="Version name"
                maxLength={120}
                className="border-line bg-page text-fg focus:border-primary h-8 min-w-0 flex-1 rounded-lg border px-2 text-[13px] outline-none"
              />
              <Button
                type="submit"
                size="sm"
                leftIcon={Save}
                loading={busy === "save"}
                disabled={!name.trim()}
              >
                Save
              </Button>
            </form>
          )}
          <p className="text-fg-faint mb-2 text-[11px]">
            A version is also kept automatically every 15 minutes of editing.
          </p>
          {versions.isLoading && <Spinner className="py-8" />}
          <ol className="space-y-1.5">
            {(versions.data ?? []).map((v) => {
              const label = v.name || formatDateTime(v.created_at);
              return (
                <li key={v.id} className="border-line rounded-lg border px-2.5 py-2">
                  <p className="text-fg truncate text-[13px] font-medium">{label}</p>
                  <p className="text-fg-subtle text-[11.5px]">
                    {v.name ? `${formatDateTime(v.created_at)} · ` : ""}
                    {v.created_by ?? "Someone"} · {v.shapes} shapes
                  </p>
                  <div className="mt-1.5 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={Eye}
                      loading={busy === `preview-${v.id}`}
                      onClick={() => void preview(v.id, label)}
                    >
                      Look
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={RotateCcw}
                        loading={busy === `restore-${v.id}`}
                        onClick={() => void restore(v.id, label)}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {versions.data?.length === 0 && (
            <p className="text-fg-subtle py-6 text-center text-sm">
              No versions yet. They appear as the diagram is edited.
            </p>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {activity.isLoading && <Spinner className="py-8" />}
          <ol className="space-y-2.5">
            {(activity.data ?? []).map((a) => (
              <li key={a.id} className="text-[13px] leading-snug">
                <span className="text-fg font-medium">{a.actor ?? "Someone"}</span>
                {a.guest && <span className="text-fg-faint"> (link)</span>}{" "}
                <span className="text-fg-muted">{DONE[a.kind]}</span>
                {a.detail && <span className="text-fg-subtle"> · {a.detail}</span>}
                <span className="text-fg-faint block text-[11px]" title={formatDateTime(a.at)}>
                  {timeAgo(a.at)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
