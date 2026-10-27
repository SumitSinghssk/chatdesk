"use client";

import { useState } from "react";
import { useStore } from "@xyflow/react";
import { Check, MessageSquare, RotateCcw, SendHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn, timeAgo } from "@/lib/utils";

import type { Comment, CommentInput } from "../../../_lib/diagramsApi";
import { MentionInput, mentionsIn, WithMentions, type Mentionable } from "./MentionInput";
import type { ShapeNode } from "./model";

export interface Thread {
  root: Comment;
  replies: Comment[];
}

export function threads(comments: Comment[]): Thread[] {
  const roots = comments.filter((c) => c.parent_id === null);
  return roots.map((root) => ({ root, replies: comments.filter((c) => c.parent_id === root.id) }));
}

/** Where a thread's pin sits: next to its shape, or where it was dropped. */
export function pinAt(root: Comment, nodes: Map<string, ShapeNode>) {
  if (root.node_id) {
    const n = nodes.get(root.node_id);
    if (n) return { x: n.position.x + (n.width ?? 160) - 6, y: n.position.y - 22 };
  }
  return root.x !== null && root.y !== null ? { x: root.x, y: root.y } : null;
}

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

/** Comment pins on the canvas, and the box to write a new one where you clicked. */
export function CommentPins({
  list,
  nodes,
  active,
  onOpen,
  draft,
  onDraftCancel,
  onDraftSave,
  people,
}: {
  list: Thread[];
  nodes: ShapeNode[];
  active: number | null;
  onOpen: (id: number) => void;
  draft: { x: number; y: number } | null;
  onDraftCancel: () => void;
  onDraftSave: (body: string, mentions: number[]) => Promise<void>;
  people?: Mentionable[];
}) {
  // drawn above the canvas (so they can be clicked), placed where the diagram point is on screen
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const screen = (x: number, y: number) => `translate(${x * zoom + tx}px, ${y * zoom + ty}px)`;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="diagram-overlay pointer-events-none absolute inset-0 z-[6] overflow-hidden">
      {list
        .filter((t) => !t.root.resolved || t.root.id === active)
        .map((t) => {
          const at = pinAt(t.root, byId);
          if (!at || t.root.node_id) return null; // shape comments show as a badge on the shape
          return (
            <div
              key={t.root.id}
              className="pointer-events-auto absolute top-0 left-0"
              style={{ transform: screen(at.x, at.y) }}
            >
              <button
                type="button"
                onClick={() => onOpen(t.root.id)}
                aria-label={`Comment by ${t.root.author}`}
                className={cn(
                  "nodrag flex -translate-y-full items-center gap-1 rounded-full rounded-bl-sm border-2 border-white py-0.5 pr-2 pl-0.5 shadow-md transition hover:scale-105",
                  active === t.root.id && "ring-primary ring-2"
                )}
                style={{ background: t.root.color }}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold text-white">
                  {initials(t.root.author)}
                </span>
                {t.replies.length > 0 && (
                  <span className="text-[11px] font-semibold text-white">{t.replies.length + 1}</span>
                )}
              </button>
            </div>
          );
        })}
      {draft && (
        <div
          className="pointer-events-auto absolute top-0 left-0"
          style={{ transform: screen(draft.x, draft.y) }}
        >
          <div className="nodrag nowheel">
            <span className="bg-primary block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" />
            <form
              id="diagram-new-comment"
              className="bg-surface border-line mt-1 w-64 rounded-xl border p-2 shadow-xl"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!text.trim()) return;
                setBusy(true);
                try {
                  await onDraftSave(text.trim(), mentionsIn(text, people));
                  setText("");
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <MentionInput
                multiline
                autoFocus
                value={text}
                onChange={setText}
                people={people}
                onCancel={onDraftCancel}
                onSubmit={() =>
                  (document.getElementById("diagram-new-comment") as HTMLFormElement | null)?.requestSubmit()
                }
                placeholder={people?.length ? "Write a comment… (@ to mention)" : "Write a comment…"}
                label="Comment"
                className="text-fg w-full resize-none bg-transparent px-1 text-sm outline-none"
              />
              <div className="flex justify-end gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={onDraftCancel}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>
                  Comment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Every thread, with replies, resolve and delete. */
export function CommentsPanel({
  list,
  active,
  onOpen,
  canComment,
  canDelete,
  onReply,
  onResolve,
  onDelete,
  onClose,
  hint,
  people,
}: {
  list: Thread[];
  active: number | null;
  onOpen: (id: number) => void;
  canComment: boolean;
  canDelete: (c: Comment) => boolean;
  onReply: (input: CommentInput) => Promise<void>;
  onResolve?: (id: number, resolved: boolean) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onClose: () => void;
  hint: string;
  people?: Mentionable[];
}) {
  const [show, setShow] = useState<"open" | "resolved">("open");
  const shown = list.filter((t) => (show === "open" ? !t.root.resolved : t.root.resolved)).reverse();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line flex items-center justify-between border-b px-3 py-2.5">
        <p className="text-fg text-sm font-semibold">Comments</p>
        <button
          type="button"
          aria-label="Close comments"
          onClick={onClose}
          className="text-fg-subtle hover:bg-hover rounded-md p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1 px-3 pt-2.5">
        {(["open", "resolved"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setShow(k)}
            aria-pressed={show === k}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition",
              show === k ? "bg-primary-soft text-primary" : "text-fg-subtle hover:bg-hover"
            )}
          >
            {k === "open" ? "Open" : "Resolved"} (
            {list.filter((t) => (k === "open") !== t.root.resolved).length})
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {shown.length === 0 && (
          <div className="text-fg-subtle py-10 text-center text-sm">
            <MessageSquare className="text-fg-faint mx-auto mb-2 h-6 w-6" />
            {show === "open" ? hint : "Nothing resolved yet."}
          </div>
        )}
        {shown.map((t) => (
          <ThreadCard
            key={t.root.id}
            thread={t}
            active={active === t.root.id}
            onOpen={() => onOpen(t.root.id)}
            canComment={canComment}
            canDelete={canDelete}
            onReply={(body) => onReply({ body, parent_id: t.root.id, mentions: mentionsIn(body, people) })}
            people={people}
            onResolve={onResolve}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  active,
  onOpen,
  canComment,
  canDelete,
  onReply,
  onResolve,
  onDelete,
  people,
}: {
  thread: Thread;
  active: boolean;
  onOpen: () => void;
  canComment: boolean;
  canDelete: (c: Comment) => boolean;
  onReply: (body: string) => Promise<void>;
  onResolve?: (id: number, resolved: boolean) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  people?: Mentionable[];
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = `reply-${thread.root.id}`;
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div
      className={cn(
        "border-line bg-surface rounded-xl border p-2.5 transition",
        active && "border-primary/60 ring-primary/20 ring-2",
        thread.root.resolved && "opacity-75"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label="Show on the diagram"
      >
        {[thread.root, ...thread.replies].map((c, i) => (
          <div key={c.id} className={cn("group flex gap-2", i > 0 && "border-line/60 mt-2 border-t pt-2")}>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: c.color }}
            >
              {initials(c.author)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="text-fg truncate text-[13px] font-semibold">{c.author}</span>
                {c.guest && <span className="text-fg-faint text-[10.5px]">guest</span>}
                <span className="text-fg-faint ml-auto shrink-0 text-[10.5px]">{timeAgo(c.created_at)}</span>
              </span>
              <span className="text-fg-muted mt-0.5 block text-[13px] leading-snug break-words whitespace-pre-wrap">
                <WithMentions text={c.body} names={(c.mentions ?? []).map((m) => m.name)} />
              </span>
            </span>
            {onDelete && canDelete(c) && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Delete comment"
                onClick={(e) => {
                  e.stopPropagation();
                  void run(() => onDelete(c.id));
                }}
                onKeyDown={(e) => e.key === "Enter" && void run(() => onDelete(c.id))}
                className="text-fg-faint hover:text-danger self-start opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        ))}
      </button>
      {canComment && (
        <form
          id={formId}
          className="mt-2 flex items-end gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setBusy(true);
            await run(async () => {
              await onReply(text.trim());
              setText("");
            });
            setBusy(false);
          }}
        >
          <MentionInput
            value={text}
            onChange={setText}
            people={people}
            onSubmit={() => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()}
            placeholder={people?.length ? "Reply… (@ to mention)" : "Reply…"}
            label="Reply"
            className="border-line bg-page text-fg focus:border-primary h-8 w-full rounded-lg border px-2 text-[13px] outline-none"
          />
          <Button
            type="submit"
            size="sm"
            iconOnly
            leftIcon={SendHorizontal}
            aria-label="Send reply"
            loading={busy}
            disabled={!text.trim()}
          />
          {onResolve && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              iconOnly
              leftIcon={thread.root.resolved ? RotateCcw : Check}
              aria-label={thread.root.resolved ? "Open again" : "Resolve"}
              onClick={() => void run(() => onResolve(thread.root.id, !thread.root.resolved))}
            />
          )}
        </form>
      )}
    </div>
  );
}
