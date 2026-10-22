"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DatePicker,
  Select,
  Textarea,
} from "@/app/admin/_components/ui/index";
import {
  enquiriesApi,
  NOTE_REQUIRED_STATUSES,
  type EnquiryDetail,
  type EnquiryStatus,
} from "@/app/admin/_lib/api/enquiriesApi";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { formatDateTime, toDateTimeLocal } from "@/lib/utils";

import { STATUS_LABELS, STATUS_OPTIONS, fromDateTimeLocal } from "./constants";

import { QK } from "@/config/query-keys";
export function ActionsPanel({
  enquiry,
  onChanged,
}: {
  enquiry: EnquiryDetail;
  onChanged: (detail: EnquiryDetail) => void;
}) {
  const [status, setStatus] = useState<EnquiryStatus>(enquiry.status);
  const [statusNote, setStatusNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const [followUp, setFollowUp] = useState(toDateTimeLocal(enquiry.follow_up_at));
  const [busy, setBusy] = useState<"status" | "assign" | "follow" | null>(null);

  const { data: assignees = [] } = useQuery({
    queryKey: [QK.ENQUIRIES, "assignees"],
    queryFn: () => enquiriesApi.assignees(),
    staleTime: 5 * 60_000,
  });

  const noteRequired = NOTE_REQUIRED_STATUSES.includes(status);
  const statusChanged = status !== enquiry.status;
  const followUpDue = !!enquiry.follow_up_at && new Date(enquiry.follow_up_at) <= new Date();

  const run = async (
    kind: typeof busy,
    fn: () => Promise<{ message?: string; data: EnquiryDetail }>,
    fallback: string
  ) => {
    setBusy(kind);
    try {
      const res = await fn();
      toast.success(res.message ?? "Saved");
      onChanged(res.data);
    } catch (err) {
      const fields = apiFieldErrors(err);
      if (kind === "status" && fields.note) setNoteError(fields.note);
      else toast.error(apiErrorMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const saveStatus = () => {
    if (noteRequired && !statusNote.trim()) {
      setNoteError(`Please add a note explaining why this is ${STATUS_LABELS[status].toLowerCase()}`);
      return;
    }
    setNoteError(undefined);
    run(
      "status",
      () => enquiriesApi.changeStatus(enquiry.id, status, statusNote.trim()),
      "Couldn't change status"
    );
  };

  return (
    <Card>
      <CardHeader title="Manage" />
      <CardBody className="space-y-5">
        <div className="space-y-2">
          <Select
            label="Status"
            value={status}
            onChange={(value) => {
              setStatus(value as EnquiryStatus);
              setNoteError(undefined);
            }}
            options={STATUS_OPTIONS}
          />
          {(statusChanged || noteRequired) && (
            <Textarea
              aria-label="Status note"
              rows={2}
              required={noteRequired}
              placeholder={noteRequired ? "Why? (required)" : "Add a note (optional)"}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              error={noteError}
            />
          )}
          <Button
            size="sm"
            variant="secondary"
            fullWidth
            loading={busy === "status"}
            disabled={!statusChanged && !statusNote.trim()}
            onClick={saveStatus}
          >
            Update status
          </Button>
        </div>

        <div className="border-line border-t pt-4">
          <Select
            label="Assigned to"
            placeholder="Unassigned"
            searchable
            value={enquiry.assigned_to ? String(enquiry.assigned_to) : ""}
            disabled={busy === "assign"}
            onChange={(value) => {
              const id = value ? Number(value) : null;
              if (id === (enquiry.assigned_to ?? null)) return;
              run("assign", () => enquiriesApi.assign(enquiry.id, id), "Couldn't assign enquiry");
            }}
            options={[
              { value: "", label: "Unassigned" },
              ...[
                ...(enquiry.assignee && !assignees.some((u) => u.id === enquiry.assignee!.id)
                  ? [enquiry.assignee]
                  : []),
                ...assignees,
              ].map((u) => ({ value: String(u.id), label: u.name })),
            ]}
          />
        </div>

        <div className="border-line space-y-2 border-t pt-4">
          <DatePicker
            withTime
            label="Follow up on"
            clearable={false}
            value={followUp}
            onChange={setFollowUp}
            hint={
              enquiry.follow_up_at ? (
                <span className={followUpDue ? "text-danger font-semibold" : undefined}>
                  {followUpDue ? "Overdue since " : "Scheduled for "}
                  {formatDateTime(enquiry.follow_up_at)}
                </span>
              ) : (
                "No follow-up scheduled."
              )
            }
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              loading={busy === "follow"}
              disabled={!followUp || followUp === toDateTimeLocal(enquiry.follow_up_at)}
              onClick={() =>
                run(
                  "follow",
                  () => enquiriesApi.followUp(enquiry.id, fromDateTimeLocal(followUp)),
                  "Couldn't set follow-up"
                )
              }
            >
              Set follow-up
            </Button>
            {enquiry.follow_up_at && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === "follow"}
                onClick={() =>
                  run("follow", () => enquiriesApi.followUp(enquiry.id, null), "Couldn't clear follow-up")
                }
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
