"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Reply,
  Trash2,
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
  Modal,
  Skeleton,
  StatusBadge,
} from "@/app/admin/_components/ui";
import { enquiriesApi, type EnquiryDetail as Detail } from "@/app/admin/_lib/api/enquiriesApi";
import { apiErrorMessage, apiErrorStatus } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { useAuthStore } from "@/app/admin/_store/authStore";
import { formatDateTime, safeHttpUrl, timeAgo } from "@/lib/utils";

import { ActionsPanel } from "./ActionsPanel";
import { ActivityTimeline } from "./ActivityTimeline";
import { STATUS_LABELS, sourceLabel } from "./constants";
import EnquiryModal from "./EnquiryModal";
import { ReplyModal } from "./ReplyModal";

import { QK } from "@/config/query-keys";
function ContactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="bg-hover text-fg-subtle mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-fg-subtle text-xs">{label}</p>
        <div className="text-fg truncate text-sm">{children}</div>
      </div>
    </div>
  );
}

const linkClass = "text-primary hover:underline";

export function EnquiryDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [editOpen, setEditOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    setEditOpen(false);
    setReplyOpen(false);
  }

  const open = id !== null;
  const detailKey = ["enquiries", "detail", id];
  const {
    data: enquiry,
    isLoading,
    error,
  } = useQuery({
    queryKey: detailKey,
    queryFn: () => enquiriesApi.get(id!),
    enabled: open && can(PERM.ENQUIRIES_VIEW),
    retry: (count, err) => apiErrorStatus(err) !== 404 && count < 2,
  });

  const loadedId = enquiry?.id;
  useEffect(() => {
    if (loadedId)
      queryClient.invalidateQueries({
        queryKey: [QK.ENQUIRIES],
        predicate: (q) => q.queryKey[1] !== "detail",
      });
  }, [loadedId, queryClient]);

  const canUpdate = can(PERM.ENQUIRIES_UPDATE);
  const canDelete = can(PERM.ENQUIRIES_DELETE);
  const ready = !!enquiry && enquiry.id === id;

  const applyDetail = (detail?: Detail) => {
    if (detail) queryClient.setQueryData(detailKey, detail);
    else queryClient.invalidateQueries({ queryKey: detailKey });
    queryClient.invalidateQueries({ queryKey: [QK.ENQUIRIES], predicate: (q) => q.queryKey[1] !== "detail" });
  };

  const remove = async () => {
    if (!enquiry) return;
    const ok = await confirm({
      title: "Delete enquiry?",
      message: (
        <>
          <b>{enquiry.reference}</b> from {enquiry.name} will be moved to the trash. You can restore it later.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await enquiriesApi.remove(enquiry.id);
      toast.success(res.message ?? "Enquiry deleted");
      queryClient.removeQueries({ queryKey: detailKey });
      queryClient.invalidateQueries({ queryKey: [QK.ENQUIRIES] });
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete enquiry"));
    }
  };

  const title = ready ? (
    <span className="flex flex-wrap items-center gap-2">
      {enquiry.name}
      <StatusBadge status={enquiry.status} label={STATUS_LABELS[enquiry.status]} />
    </span>
  ) : (
    "Enquiry"
  );

  const description = ready ? (
    <>
      <span className="font-mono">{enquiry.reference}</span> · Received{" "}
      <span title={formatDateTime(enquiry.created_at)}>{timeAgo(enquiry.created_at)}</span> via{" "}
      {sourceLabel(enquiry.source)}
    </>
  ) : undefined;

  const headerActions = ready ? (
    <>
      {canUpdate && (
        <Button
          size="sm"
          leftIcon={Reply}
          onClick={() => setReplyOpen(true)}
          disabled={!enquiry.email}
          title={enquiry.email ? undefined : "This enquiry has no email address"}
        >
          Reply
        </Button>
      )}
      {canUpdate && (
        <Button size="sm" variant="secondary" leftIcon={Pencil} onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      )}
      {canDelete && (
        <Button size="sm" variant="danger-outline" leftIcon={Trash2} onClick={remove}>
          Delete
        </Button>
      )}
    </>
  ) : undefined;

  const whatsapp = enquiry?.phone?.replace(/\D/g, "");
  const isSuperAdmin = !!currentUser?.permissions.includes("*");

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        variant="drawer"
        size="2xl"
        title={title}
        description={description}
        headerActions={headerActions}
        bodyClassName="bg-page"
      >
        {error ? (
          <Card>
            <EmptyState
              title={apiErrorStatus(error) === 404 ? "Enquiry not found" : "Couldn't load enquiry"}
              description={
                apiErrorStatus(error) === 404
                  ? "It may have been deleted or moved to the trash."
                  : apiErrorMessage(error)
              }
              action={
                <Button variant="secondary" onClick={onClose}>
                  Back to enquiries
                </Button>
              }
            />
          </Card>
        ) : isLoading || !ready ? (
          <div className="grid gap-4 lg:grid-cols-3" aria-busy>
            <div className="space-y-4 lg:col-span-2">
              <Skeleton className="h-40" />
              <Skeleton className="h-64" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-48" />
              <Skeleton className="h-56" />
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader
                  title={enquiry.subject || "Message"}
                  description={formatDateTime(enquiry.created_at)}
                />
                <CardBody>
                  <p className="text-fg text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                    {enquiry.message}
                  </p>
                </CardBody>
              </Card>

              <ActivityTimeline
                enquiryId={enquiry.id}
                activities={enquiry.activities}
                canUpdate={canUpdate}
                currentUserId={currentUser?.id}
                isSuperAdmin={isSuperAdmin}
                onChanged={() => applyDetail()}
              />
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Contact" />
                <CardBody className="space-y-3">
                  {enquiry.email && (
                    <ContactRow icon={Mail} label="Email">
                      <a href={`mailto:${enquiry.email}`} className={linkClass}>
                        {enquiry.email}
                      </a>
                    </ContactRow>
                  )}
                  {enquiry.phone && (
                    <ContactRow icon={Phone} label="Phone">
                      <a href={`tel:${enquiry.phone.replace(/[^\d+]/g, "")}`} className={linkClass}>
                        {enquiry.phone}
                      </a>
                    </ContactRow>
                  )}
                  {whatsapp && (
                    <ContactRow icon={MessageCircle} label="WhatsApp">
                      <a
                        href={`https://wa.me/${whatsapp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        Open chat
                      </a>
                    </ContactRow>
                  )}
                  {enquiry.company && (
                    <ContactRow icon={Building2} label="Company">
                      {enquiry.company}
                    </ContactRow>
                  )}
                  {enquiry.source_url && (
                    <ContactRow icon={ExternalLink} label="Submitted from">
                      {safeHttpUrl(enquiry.source_url) ? (
                        <a
                          href={safeHttpUrl(enquiry.source_url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={linkClass}
                        >
                          {enquiry.source_url}
                        </a>
                      ) : (
                        <span className="break-all">{enquiry.source_url}</span>
                      )}
                    </ContactRow>
                  )}
                  {enquiry.follow_up_at && (
                    <ContactRow icon={CalendarClock} label="Follow-up">
                      {formatDateTime(enquiry.follow_up_at)}
                    </ContactRow>
                  )}
                  <p className="border-line text-fg-subtle border-t pt-3 text-xs">
                    {enquiry.creator ? <>Logged by {enquiry.creator.name}</> : <>Submitted on the website</>}
                    {enquiry.seen_at && <> · First opened {timeAgo(enquiry.seen_at)}</>}
                  </p>
                </CardBody>
              </Card>

              {canUpdate && (
                <ActionsPanel
                  key={`${enquiry.status}|${enquiry.assigned_to}|${enquiry.follow_up_at}|${enquiry.activities.length}`}
                  enquiry={enquiry}
                  onChanged={applyDetail}
                />
              )}
            </div>
          </div>
        )}
      </Modal>

      {ready && canUpdate && (
        <>
          <EnquiryModal
            open={editOpen}
            enquiry={enquiry}
            onClose={() => setEditOpen(false)}
            onSaved={(detail) => {
              setEditOpen(false);
              applyDetail(detail);
            }}
          />
          {enquiry.email && (
            <ReplyModal
              open={replyOpen}
              enquiry={enquiry}
              onClose={() => setReplyOpen(false)}
              onSent={(detail) => {
                setReplyOpen(false);
                applyDetail(detail);
              }}
            />
          )}
        </>
      )}
    </>
  );
}
