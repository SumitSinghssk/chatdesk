"use client";

import { useState } from "react";
import { Pencil, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import { inboxApi, type InboxNote } from "../../_lib/inboxApi";
import { bubbleTime } from "./format";

/** An internal note in the chat timeline: only the team sees it, never the customer. */
export function NoteBubble({
  conversationId,
  note,
  onChanged,
}: {
  conversationId: number;
  note: InboxNote;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await inboxApi.updateNote(conversationId, note.id, body.trim());
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this note? Your team won't see it any more.")) return;
    setBusy(true);
    try {
      await inboxApi.deleteNote(conversationId, note.id);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex justify-center px-3 py-1 sm:px-6">
      <div className="group/note w-full max-w-lg rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[13px] shadow-xs dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          <StickyNote className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-semibold">{note.author ?? "Team note"}</span>
          <span className="shrink-0">
            · {bubbleTime(note.created_at)}
            {note.edited_at ? " · edited" : ""}
          </span>
          {note.can_edit && !editing && (
            <span className="ml-auto flex shrink-0 gap-1 opacity-0 transition group-hover/note:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                aria-label="Edit note"
                onClick={() => {
                  setBody(note.body);
                  setEditing(true);
                }}
                className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-500/20"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Delete note"
                disabled={busy}
                onClick={remove}
                className="hover:text-danger rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={4000}
              aria-label="Edit note"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="bg-surface text-fg w-full resize-y rounded-md border border-amber-300 px-2 py-1.5 text-[13px] focus:outline-none dark:border-amber-500/40"
            />
            <div className="flex justify-end gap-2">
              <Button size="xs" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="xs" loading={busy} disabled={!body.trim()} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-fg break-words whitespace-pre-wrap">{note.body}</p>
        )}
      </div>
    </div>
  );
}
