"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CircleCheck,
  Clock,
  ExternalLink,
  Pencil,
  Reply,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { HistoryButton } from "@/app/admin/_components/activity";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  StatusBadge,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { commentsApi, type Comment, type CommentStatus } from "@/app/admin/_lib/api/commentsApi";
import { apiErrorMessage, apiErrorStatus } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { QK } from "@/config/query-keys";
import { ADMIN_ROUTES, WEBSITE_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const MODERATION: {
  status: CommentStatus;
  label: string;
  icon: typeof Clock;
  variant: "success" | "secondary";
}[] = [
  { status: "approved", label: "Approve", icon: CircleCheck, variant: "success" },
  { status: "pending", label: "Pending", icon: Clock, variant: "secondary" },
  { status: "rejected", label: "Reject", icon: Ban, variant: "secondary" },
  { status: "spam", label: "Spam", icon: ShieldAlert, variant: "secondary" },
];

export function CommentDrawer({
  id,
  onClose,
  onSelect,
}: {
  id: number | null;
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const detailKey = [QK.COMMENTS, "detail", id];
  const {
    data: comment,
    error,
    isLoading,
  } = useQuery({
    queryKey: detailKey,
    queryFn: () => commentsApi.get(id!),
    enabled: !!id,
  });

  const canModerate = can(PERM.COMMENTS_MODERATE);
  const canReply = can(PERM.COMMENTS_REPLY);
  const canDelete = can(PERM.COMMENTS_DELETE);
  const ready = !!comment && comment.id === id;

  const refresh = (detail?: Comment) => {
    if (detail) queryClient.setQueryData([QK.COMMENTS, "detail", detail.id], detail);
    queryClient.invalidateQueries({ queryKey: [QK.COMMENTS] });
    queryClient.invalidateQueries({ queryKey: [QK.BLOGS] });
  };

  const run = async (fn: () => Promise<{ message?: string; data?: Comment | null }>, fallback: string) => {
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      refresh(res.data ?? undefined);
      return res.data ?? null;
    } catch (err) {
      toast.error(apiErrorMessage(err, fallback));
      return undefined;
    }
  };

  const remove = async () => {
    if (!comment) return;
    const ok = await confirm({
      title: "Delete comment?",
      message: (
        <>
          The comment by <b>{comment.author_name}</b>
          {comment.replies_count ? ` and its ${comment.replies_count} replies` : ""} will be permanently
          deleted.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const done = await run(() => commentsApi.remove(comment.id), "Couldn't delete comment");
    if (done !== undefined) {
      queryClient.removeQueries({ queryKey: detailKey });
      onClose();
    }
  };

  const title = ready ? (
    <span className="flex flex-wrap items-center gap-2">
      {comment.author_name}
      {comment.is_admin && <ShieldCheck className="text-primary h-4 w-4" aria-label="Team reply" />}
      <StatusBadge status={comment.status} />
    </span>
  ) : (
    "Comment"
  );

  const description = ready ? (
    <>
      On <b>{comment.blog?.title ?? "a deleted post"}</b> ·{" "}
      <span title={formatDateTime(comment.created_at)}>{timeAgo(comment.created_at)}</span>
    </>
  ) : undefined;

  const headerActions = ready ? (
    <>
      <HistoryButton subject={{ type: "blog_comment", id: comment.id, label: comment.author_name }} />
      {canDelete && (
        <Button size="sm" variant="danger-outline" leftIcon={Trash2} onClick={remove}>
          Delete
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      variant="drawer"
      size="xl"
      title={title}
      description={description}
      headerActions={headerActions}
      bodyClassName="bg-page"
    >
      {error ? (
        <Card>
          <EmptyState
            title={apiErrorStatus(error) === 404 ? "Comment not found" : "Couldn't load comment"}
            description={
              apiErrorStatus(error) === 404
                ? "It may have been deleted."
                : apiErrorMessage(error, "Please try again.")
            }
          />
        </Card>
      ) : isLoading || !ready ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {canModerate && (
            <Card className="flex flex-wrap items-center gap-2 p-3">
              <span className="text-fg-subtle mr-1 text-xs font-medium">Moderation</span>
              {MODERATION.map((m) => (
                <Button
                  key={m.status}
                  size="sm"
                  variant={
                    comment.status === m.status
                      ? m.status === "approved"
                        ? "success"
                        : "primary"
                      : "secondary"
                  }
                  leftIcon={m.icon}
                  aria-pressed={comment.status === m.status}
                  disabled={comment.status === m.status}
                  onClick={() =>
                    run(() => commentsApi.setStatus(comment.id, m.status), "Couldn't change status")
                  }
                >
                  {m.label}
                </Button>
              ))}
            </Card>
          )}

          <CommentBody
            key={`${comment.id}-${comment.updated_at}`}
            comment={comment}
            canEdit={canModerate}
            run={run}
          />

          <Card className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
            <Meta label="Post">
              {comment.blog ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={WEBSITE_ROUTES.BLOG_POST(comment.blog.slug)}
                    target="_blank"
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    View post <ExternalLink className="h-3 w-3" />
                  </Link>
                  <Link
                    href={ADMIN_ROUTES.BLOGS({ open: comment.blog.id })}
                    className="text-primary hover:underline"
                  >
                    Edit post
                  </Link>
                  {!comment.blog.comments_enabled && (
                    <span className="text-warning text-xs">Comments closed</span>
                  )}
                </span>
              ) : (
                "Deleted post"
              )}
            </Meta>
            <Meta label="Email">{comment.author_email}</Meta>
            <Meta label="IP address">{comment.ip_address}</Meta>
            <Meta label="Approved">
              {comment.approved_at
                ? `${formatDateTime(comment.approved_at)}${comment.approved_by ? ` by ${comment.approved_by.name}` : ""}`
                : null}
            </Meta>
            {comment.user_agent && (
              <div className="sm:col-span-2">
                <Meta label="Browser">
                  <span className="font-mono text-xs break-all">{comment.user_agent}</span>
                </Meta>
              </div>
            )}
          </Card>

          {canReply && <ReplyBox key={comment.id} comment={comment} run={run} onSelect={onSelect} />}

          {!!comment.thread?.length && (
            <Card className="p-4">
              <h3 className="text-fg mb-3 text-sm font-semibold">Conversation</h3>
              <ol className="space-y-2">
                {comment.thread.map((item) => (
                  <li key={item.id} style={{ marginLeft: Math.min(item.depth, 4) * 20 }}>
                    <button
                      type="button"
                      onClick={() => item.id !== comment.id && onSelect(item.id)}
                      className={cn(
                        "border-line w-full rounded-lg border p-2.5 text-left transition",
                        item.id === comment.id ? "border-primary bg-primary-soft/40" : "hover:bg-hover"
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <Avatar name={item.author_name} size={20} />
                        <span className="text-fg font-semibold">{item.author_name}</span>
                        {item.is_admin && <ShieldCheck className="text-primary h-3.5 w-3.5" />}
                        <StatusBadge status={item.status} />
                        <span className="text-fg-faint ml-auto" title={formatDateTime(item.created_at)}>
                          {timeAgo(item.created_at)}
                        </span>
                      </span>
                      <span className="text-fg-muted mt-1 line-clamp-3 block text-sm whitespace-pre-line">
                        {item.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}
    </Modal>
  );
}

type Run = (
  fn: () => Promise<{ message?: string; data?: Comment | null }>,
  fallback: string
) => Promise<Comment | null | undefined>;

function CommentBody({ comment, canEdit, run }: { comment: Comment; canEdit: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(comment.author_name);
  const [email, setEmail] = useState(comment.author_email ?? "");
  const [body, setBody] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const done = await run(
      () => commentsApi.update(comment.id, { author_name: name, author_email: email || null, body }),
      "Couldn't save comment"
    );
    setSaving(false);
    if (done !== undefined) setEditing(false);
  };

  if (editing)
    return (
      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Textarea label="Comment" rows={6} value={body} onChange={(e) => setBody(e.target.value)} required />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={name.trim().length < 2 || body.trim().length < 2}>
            Save changes
          </Button>
        </div>
      </Card>
    );

  return (
    <Card className="p-4">
      {comment.parent && (
        <p className="border-line text-fg-subtle mb-3 border-l-2 pl-3 text-xs">
          Reply to <b className="text-fg-muted">{comment.parent.author_name}</b>: {comment.parent.body}
        </p>
      )}
      <p className="text-fg text-[15px] leading-relaxed break-words whitespace-pre-line">{comment.body}</p>
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" leftIcon={Pencil} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </Card>
  );
}

function ReplyBox({
  comment,
  run,
  onSelect,
}: {
  comment: Comment;
  run: Run;
  onSelect: (id: number) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    const created = await run(() => commentsApi.reply(comment.id, body), "Couldn't publish reply");
    setSending(false);
    if (created) {
      setBody("");
      onSelect(created.id);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <Textarea
        label={`Reply to ${comment.author_name}`}
        hint={
          comment.status === "approved" ? "Published right away." : "Replying also approves this comment."
        }
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
      />
      <div className="flex justify-end">
        <Button leftIcon={Reply} onClick={send} loading={sending} disabled={body.trim().length < 2}>
          Publish reply
        </Button>
      </div>
    </Card>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-fg-subtle text-xs font-semibold">{label}</p>
      <div className="text-fg mt-0.5 break-words">{children || <span className="text-fg-faint">—</span>}</div>
    </div>
  );
}
