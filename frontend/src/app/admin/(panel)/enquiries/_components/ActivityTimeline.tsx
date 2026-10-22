"use client";

import { useState } from "react";
import {
  CalendarClock,
  Inbox,
  Mail,
  Pencil,
  RefreshCw,
  StickyNote,
  Trash2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  StatusBadge,
  Textarea,
} from "@/app/admin/_components/ui/index";
import {
  enquiriesApi,
  type EnquiryActivity,
  type EnquiryActivityType,
  type EnquiryStatus,
} from "@/app/admin/_lib/api/enquiriesApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { cn, formatDateTime, timeAgo, titleCase } from "@/lib/utils";

import { STATUS_LABELS, sourceLabel } from "./constants";

const TYPES: Record<EnquiryActivityType, { icon: LucideIcon; tone: string }> = {
  created: { icon: Inbox, tone: "bg-info-soft text-info" },
  note: { icon: StickyNote, tone: "bg-warning-soft text-warning" },
  status: { icon: RefreshCw, tone: "bg-purple-soft text-purple" },
  reply: { icon: Mail, tone: "bg-success-soft text-success" },
  assigned: { icon: UserPlus, tone: "bg-primary-soft text-primary" },
  follow_up: { icon: CalendarClock, tone: "bg-info-soft text-info" },
  edited: { icon: Pencil, tone: "bg-hover text-fg-muted" },
};

const str = (v: unknown) => (typeof v === "string" ? v : null);

function StatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  return <StatusBadge status={status} label={STATUS_LABELS[status as EnquiryStatus]} />;
}

function Headline({ item }: { item: EnquiryActivity }) {
  const meta = item.meta ?? {};
  const who = item.user?.name;
  switch (item.type) {
    case "created":
      return (
        <>
          {who ? <b>{who}</b> : "Received"} {who ? "logged this enquiry" : "via"}{" "}
          {str(meta.source) && <span className="text-fg-muted">({sourceLabel(str(meta.source)!)})</span>}
        </>
      );
    case "note":
      return (
        <>
          <b>{who ?? "Someone"}</b> added a note
        </>
      );
    case "status":
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <b>{who ?? "System"}</b> changed status
          <StatusChip status={str(meta.from)} /> → <StatusChip status={str(meta.to)} />
          {meta.bulk === true && <span className="text-fg-subtle">(bulk)</span>}
        </span>
      );
    case "reply":
      return (
        <>
          <b>{who ?? "Someone"}</b> replied to <span className="text-fg-muted">{str(meta.to)}</span>
        </>
      );
    case "assigned":
      return (
        <>
          <b>{who ?? "Someone"}</b>{" "}
          {item.body ? item.body.charAt(0).toLowerCase() + item.body.slice(1) : "changed the assignee"}
        </>
      );
    case "follow_up":
      return str(meta.to) ? (
        <>
          <b>{who ?? "Someone"}</b> set a follow-up for <b>{formatDateTime(str(meta.to))}</b>
        </>
      ) : (
        <>
          <b>{who ?? "Someone"}</b> cleared the follow-up
        </>
      );
    case "edited":
      return (
        <>
          <b>{who ?? "Someone"}</b> edited{" "}
          {Object.keys((meta.new as Record<string, unknown>) ?? {})
            .map((k) => titleCase(k).toLowerCase())
            .join(", ") || "the details"}
        </>
      );
    default:
      return <>{titleCase(item.type)}</>;
  }
}

function Body({ item }: { item: EnquiryActivity }) {
  const meta = item.meta ?? {};
  if (item.type === "reply") {
    return (
      <div className="border-line bg-page mt-2 rounded-lg border p-3 text-sm">
        <p className="mb-1 font-semibold">{str(meta.subject)}</p>
        <p className="text-fg-muted whitespace-pre-wrap">{item.body}</p>
      </div>
    );
  }
  if (item.type === "note" || (item.type === "status" && item.body)) {
    return (
      <p className="bg-page text-fg mt-1.5 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">{item.body}</p>
    );
  }
  return null;
}

export function ActivityTimeline({
  enquiryId,
  activities,
  canUpdate,
  currentUserId,
  isSuperAdmin,
  onChanged,
}: {
  enquiryId: number;
  activities: EnquiryActivity[];
  canUpdate: boolean;
  currentUserId: number | undefined;
  isSuperAdmin: boolean;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await enquiriesApi.addNote(enquiryId, note.trim());
      toast.success(res.message ?? "Note added");
      setNote("");
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't add note"));
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (item: EnquiryActivity) => {
    const ok = await confirm({
      title: "Delete note?",
      message: "This note will be permanently removed.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await enquiriesApi.deleteNote(enquiryId, item.id);
      toast.success(res.message ?? "Note deleted");
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete note"));
    }
  };

  return (
    <Card>
      <CardHeader title="Activity" description="Notes, replies and changes — newest first." />
      <CardBody className="space-y-5">
        {canUpdate && (
          <div className="space-y-2">
            <Textarea
              aria-label="Add a note"
              placeholder="Add an internal note…"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg-subtle hidden text-xs sm:inline">Ctrl + Enter to save</span>
              <Button
                size="sm"
                leftIcon={StickyNote}
                loading={saving}
                disabled={!note.trim()}
                onClick={addNote}
              >
                Add note
              </Button>
            </div>
          </div>
        )}

        {activities.length === 0 ? (
          <EmptyState title="No activity yet" className="py-8" />
        ) : (
          <ol className="relative space-y-5">
            <span aria-hidden className="bg-line absolute top-2 bottom-2 left-4 w-px" />
            {activities.map((item) => {
              const { icon: Icon, tone } = TYPES[item.type] ?? TYPES.edited;
              const deletable =
                canUpdate &&
                item.type === "note" &&
                (isSuperAdmin || (!!currentUserId && item.user?.id === currentUserId));
              return (
                <li key={item.id} className="relative flex gap-3">
                  <span
                    className={cn(
                      "ring-surface relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4",
                      tone
                    )}
                  >
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-fg text-sm">
                        <Headline item={item} />
                      </div>
                      {deletable && (
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          leftIcon={Trash2}
                          aria-label="Delete note"
                          title="Delete note"
                          className="hover:bg-danger-soft hover:text-danger"
                          onClick={() => deleteNote(item)}
                        />
                      )}
                    </div>
                    <p className="text-fg-subtle text-xs" title={formatDateTime(item.created_at)}>
                      {timeAgo(item.created_at)}
                    </p>
                    <Body item={item} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
