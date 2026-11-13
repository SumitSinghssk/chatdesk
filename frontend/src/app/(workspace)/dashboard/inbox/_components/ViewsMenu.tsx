"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkPlus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button, Checkbox, Input, Modal } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { INBOX_QK, inboxApi, type SavedView } from "../../_lib/inboxApi";
import { Tooltip } from "../../_components/Tooltip";

/** Saved searches + filters: apply one, save the current one, delete. */
export function ViewsMenu({
  current,
  canSave,
  readOnly,
  onApply,
}: {
  /** what's on screen now (search, tab, owner, unread, filters) */
  current: Record<string, unknown>;
  /** there's a search or a filter worth saving */
  canSave: boolean;
  readOnly: boolean;
  onApply: (view: SavedView) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const views = useQuery({
    queryKey: INBOX_QK.VIEWS,
    queryFn: async () => (await inboxApi.views()).data,
    enabled: open,
  });

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await inboxApi.saveView({ name: name.trim(), params: current, shared });
      toast.success(res.message ?? "View saved");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.VIEWS });
      setSaving(false);
      setName("");
      setShared(false);
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (v: SavedView) => {
    if (!window.confirm(`Delete the view “${v.name}”${v.shared ? " for the whole team" : ""}?`)) return;
    try {
      await inboxApi.deleteView(v.id);
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.VIEWS });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <Tooltip label="Saved views" align="end">
        <Button
          iconOnly
          variant="ghost"
          size="sm"
          leftIcon={Bookmark}
          aria-label="Saved views"
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setSaving(false);
        }}
        size="sm"
        title="Saved views"
        description="A search, tab and filters you use often, one click away."
        footer={
          saving ? (
            <>
              <Button variant="secondary" onClick={() => setSaving(false)}>
                Back
              </Button>
              <Button loading={busy} disabled={!name.trim()} onClick={save}>
                Save view
              </Button>
            </>
          ) : !readOnly ? (
            <Tooltip label={canSave ? "Save what's on screen now" : "Search or set a filter first"}>
              <Button leftIcon={BookmarkPlus} disabled={!canSave} onClick={() => setSaving(true)}>
                Save current view
              </Button>
            </Tooltip>
          ) : undefined
        }
      >
        {saving ? (
          <div className="space-y-3">
            <Input
              label="Name"
              autoFocus
              maxLength={60}
              placeholder="e.g. Unanswered orders"
              value={name}
              error={error || undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && void save()}
            />
            <Checkbox label="Share with my team" checked={shared} onChange={setShared} />
          </div>
        ) : views.isLoading ? (
          <p className="text-fg-subtle text-sm">Loading…</p>
        ) : !views.data?.length ? (
          <p className="text-fg-subtle text-sm">
            No saved views yet. Search or set filters, then save them here.
          </p>
        ) : (
          <ul className="divide-line border-line divide-y rounded-lg border">
            {views.data.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    onApply(v);
                    setOpen(false);
                  }}
                  className="hover:text-primary min-w-0 flex-1 truncate text-left text-sm font-medium"
                >
                  {v.name}
                </button>
                {v.shared && (
                  <span
                    className="text-fg-subtle inline-flex items-center gap-1 text-[11px]"
                    title="Shared with the team"
                  >
                    <Users className="h-3 w-3" /> Team
                  </span>
                )}
                {!readOnly && (v.mine || !v.shared) && (
                  <button
                    type="button"
                    aria-label={`Delete ${v.name}`}
                    onClick={() => remove(v)}
                    className={cn("text-fg-faint hover:text-danger rounded p-1")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
