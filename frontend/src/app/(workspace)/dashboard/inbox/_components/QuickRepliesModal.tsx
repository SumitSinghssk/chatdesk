"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, EmptyState, Input, Modal, Skeleton, Textarea } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { INBOX_QK, inboxApi, type QuickReply } from "../../_lib/inboxApi";

/** Create, edit and delete saved answers. Agents insert them by typing "/" in the composer. */
export function QuickRepliesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: INBOX_QK.QUICK_REPLIES,
    queryFn: async () => (await inboxApi.quickReplies()).data,
    enabled: open,
  });

  const start = (row: QuickReply | "new") => {
    setEditing(row);
    setShortcut(row === "new" ? "" : row.shortcut);
    setText(row === "new" ? "" : row.text);
    setErrors({});
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await inboxApi.saveQuickReply(
        { shortcut, text },
        editing && editing !== "new" ? editing.id : undefined
      );
      toast.success(res.message ?? "Saved");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.QUICK_REPLIES });
    } catch (err) {
      if (err instanceof CustomerApiError && Object.keys(err.errors).length) setErrors(err.errors);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: QuickReply) => {
    const ok = await confirm({
      title: `Delete /${row.shortcut}?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await inboxApi.deleteQuickReply(row.id);
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.QUICK_REPLIES });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Quick replies"
      description='Saved answers for common questions. In a chat, type "/" and the shortcut to insert one.'
      headerActions={
        !editing && (
          <Button size="sm" leftIcon={Plus} onClick={() => start("new")}>
            New
          </Button>
        )
      }
    >
      {editing ? (
        <form onSubmit={save} className="space-y-4" noValidate>
          <Input
            label="Shortcut"
            name="shortcut"
            required
            autoFocus
            placeholder="thanks"
            hint="Type / followed by this in the composer."
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            error={errors.shortcut}
            maxLength={40}
          />
          <Textarea
            label="Reply text"
            name="quick_text"
            required
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={errors.text}
            maxLength={4096}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={!shortcut.trim() || !text.trim()}>
              Save quick reply
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={Zap}
          title="No quick replies yet"
          description="Save answers you send often, like opening hours, payment details or a thank-you."
          action={
            <Button leftIcon={Plus} onClick={() => start("new")}>
              Create the first one
            </Button>
          }
        />
      ) : (
        <ul className="divide-line border-line divide-y rounded-lg border">
          {data.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="bg-primary-soft text-primary shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
                /{row.shortcut}
              </span>
              <p className="text-fg-muted line-clamp-2 min-w-0 flex-1 text-sm whitespace-pre-wrap">
                {row.text}
              </p>
              <Button
                iconOnly
                variant="ghost"
                size="sm"
                leftIcon={Pencil}
                aria-label={`Edit /${row.shortcut}`}
                onClick={() => start(row)}
              />
              <Button
                iconOnly
                variant="ghost"
                size="sm"
                leftIcon={Trash2}
                aria-label={`Delete /${row.shortcut}`}
                onClick={() => remove(row)}
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
