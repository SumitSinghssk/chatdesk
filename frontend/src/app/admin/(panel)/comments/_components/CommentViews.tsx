import type { ReactNode } from "react";
import { CornerDownRight, MessageSquareReply, Newspaper, ShieldCheck } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Avatar } from "@/app/admin/_components/ui/index";
import type { Comment } from "@/app/admin/_lib/api/commentsApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

export function CommentAuthor({ row, size = 32 }: { row: Comment; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={row.author_name} size={size} />
      <span className="min-w-0">
        <span className="text-fg flex items-center gap-1 truncate font-medium">
          <span className="truncate">{row.author_name}</span>
          {row.is_admin && (
            <ShieldCheck className="text-primary h-3.5 w-3.5 shrink-0" aria-label="Team reply" />
          )}
        </span>
        {row.author_email && (
          <span className="text-fg-subtle block truncate text-xs">{row.author_email}</span>
        )}
      </span>
    </span>
  );
}

export function InReplyTo({ row }: { row: Comment }) {
  if (!row.parent) return null;
  return (
    <span className="text-fg-subtle flex min-w-0 items-center gap-1 text-xs">
      <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Reply to {row.parent.author_name}</span>
    </span>
  );
}

export function CommentListItem({
  row,
  slots,
  status,
  actions,
}: {
  row: Comment;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox}
      <Avatar name={row.author_name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-fg truncate font-semibold">{row.author_name}</span>
          {row.is_admin && <ShieldCheck className="text-primary h-3.5 w-3.5" aria-label="Team reply" />}
          <span className="text-fg-faint text-xs" title={formatDateTime(row.created_at)}>
            {timeAgo(row.created_at)}
          </span>
        </div>
        <p className="text-fg-muted mt-0.5 line-clamp-2 text-sm whitespace-pre-line">{row.body}</p>
        <p className="text-fg-subtle mt-1 flex min-w-0 items-center gap-1 truncate text-xs">
          <Newspaper className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{row.blog?.title ?? "Deleted post"}</span>
          {row.parent && <> · reply to {row.parent.author_name}</>}
        </p>
      </div>
      <span className="shrink-0">{status}</span>
      <span className="hidden shrink-0 sm:block">{actions}</span>
    </div>
  );
}

export function CommentCard({
  row,
  slots,
  status,
  actions,
}: {
  row: Comment;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <CommentAuthor row={row} size={36} />
        </div>
        {slots.checkbox}
      </div>

      <p className="text-fg-muted mt-3 mb-3 line-clamp-4 min-h-[5em] text-sm whitespace-pre-line">
        {row.body}
      </p>

      <p className="text-fg-subtle flex min-w-0 items-center gap-1 truncate text-xs">
        <Newspaper className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{row.blog?.title ?? "Deleted post"}</span>
      </p>
      <div className="mt-1 min-h-5">
        <InReplyTo row={row} />
      </div>

      <div className="border-line mt-auto flex items-center gap-2 border-t pt-3 text-xs">
        <span className="text-fg-subtle" title={formatDateTime(row.created_at)}>
          {timeAgo(row.created_at)}
        </span>
        {!!row.replies_count && (
          <span className="text-fg-muted inline-flex items-center gap-1">
            <MessageSquareReply className="h-3.5 w-3.5" />
            {row.replies_count}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {status}
          {actions}
        </span>
      </div>
    </>
  );
}
