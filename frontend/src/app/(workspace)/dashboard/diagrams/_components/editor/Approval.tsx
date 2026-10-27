"use client";

import { useState } from "react";
import { BadgeCheck, GitCompare, LockOpen, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, Modal, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { formatDateTime } from "@/lib/utils";

import { diagramsApi, type Level, type LiveState, type SinceApproval } from "../../../_lib/diagramsApi";

/** "Approved and locked" (or "changed since approval") under the top bar, with what each person can do. */
export function ApprovalBanner({ id, state, level }: { id: number; state: LiveState; level: Level }) {
  const confirm = useConfirm();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [changes, setChanges] = useState<SinceApproval | null | "loading">(null);
  const approval = state.approval;
  if (!approval) return null;
  const manage = level === "manage";
  const when = approval.approved_at ? formatDateTime(approval.approved_at) : "";

  const run = async (key: string, fn: () => Promise<{ message?: string }>) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res.message) toast.success(res.message);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const showChanges = async () => {
    setChanges("loading");
    try {
      setChanges((await diagramsApi.sinceApproval(id)).data);
    } catch (err) {
      toast.error(errorMessage(err));
      setChanges(null);
    }
  };

  return (
    <>
      {state.locked ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-emerald-300/60 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>Approved</b> by {approval.approved_by} on {when}. It&apos;s locked: nobody can change it until
            it&apos;s unlocked.
          </span>
          {manage ? (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={LockOpen}
              loading={busy === "unlock"}
              onClick={async () => {
                const ok = await confirm({
                  title: "Unlock for changes?",
                  message:
                    "People who can edit can change it again. You can approve it again afterwards, and see what changed.",
                  confirmLabel: "Unlock",
                  variant: "primary",
                });
                if (ok) await run("unlock", () => diagramsApi.unlock(id));
              }}
            >
              Unlock for changes
            </Button>
          ) : level === "edit" ? (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={MessageSquareWarning}
              onClick={() => setAsking(true)}
            >
              Ask to change
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-1.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <GitCompare className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Unlocked. It was approved by {approval.approved_by} on {when}.
          </span>
          <Button size="sm" variant="ghost" onClick={() => void showChanges()}>
            What changed
          </Button>
          {manage && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={BadgeCheck}
              loading={busy === "approve"}
              onClick={() => void run("approve", () => diagramsApi.approve(id))}
            >
              Approve again
            </Button>
          )}
        </div>
      )}

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        size="sm"
        title="Ask to change it"
        description="The people who manage this diagram are told, and can unlock it."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              loading={busy === "ask"}
              onClick={async () => {
                if (await run("ask", () => diagramsApi.requestChange(id, note.trim()))) {
                  setAsking(false);
                  setNote("");
                }
              }}
            >
              Send
            </Button>
          </div>
        }
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          maxLength={500}
          rows={3}
          aria-label="What you want to change"
          placeholder="What do you want to change, and why?"
          className="border-line bg-page text-fg focus:border-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
        />
      </Modal>

      <Modal
        open={changes !== null}
        onClose={() => setChanges(null)}
        size="sm"
        title="Changes since it was approved"
      >
        {changes === "loading" ? (
          <Spinner className="py-8" />
        ) : changes ? (
          <div className="space-y-3 text-sm">
            {(
              [
                ["Added", changes.added, "text-emerald-700 dark:text-emerald-400"],
                ["Changed", changes.changed, "text-amber-700 dark:text-amber-400"],
                ["Removed", changes.removed, "text-danger"],
              ] as const
            ).map(([title, items, tone]) =>
              items.length ? (
                <div key={title}>
                  <p className={`text-xs font-semibold tracking-wide uppercase ${tone}`}>
                    {title} ({items.length})
                  </p>
                  <ul className="text-fg-muted mt-1 list-disc space-y-0.5 pl-5">
                    {items.slice(0, 30).map((label, i) => (
                      <li key={i}>{label}</li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
            {changes.lines_added + changes.lines_removed + changes.lines_changed > 0 && (
              <p className="text-fg-subtle text-xs">
                Lines: {changes.lines_added} added, {changes.lines_changed} changed, {changes.lines_removed}{" "}
                removed.
              </p>
            )}
            {!changes.added.length &&
              !changes.changed.length &&
              !changes.removed.length &&
              changes.lines_added + changes.lines_removed + changes.lines_changed === 0 && (
                <p className="text-fg-subtle">Nothing has changed since it was approved.</p>
              )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
