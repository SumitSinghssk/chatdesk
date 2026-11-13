"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button, Checkbox, Input, Modal, Select } from "@/app/admin/_components/ui/index";

import { INBOX_QK, inboxApi, type InboxFilters } from "../../_lib/inboxApi";
import { TEAM_QK, teamApi } from "../../_lib/teamApi";

export const WAITING_OPTIONS = [
  { value: 15, label: "Unanswered 15+ min" },
  { value: 60, label: "Unanswered 1+ hour" },
  { value: 240, label: "Unanswered 4+ hours" },
  { value: 1440, label: "Unanswered 24+ hours" },
];

export const ATTACHMENT_LABELS: Record<NonNullable<InboxFilters["attachment"]>, string> = {
  any: "Any attachment",
  image: "Photos",
  document: "Documents",
  audio: "Voice & audio",
  video: "Videos",
  location: "Locations",
};

/** "Unanswered 1+ hour", "Photos", "Since 1 Nov"… one short label per active filter. */
export function filterChips(f: InboxFilters): { key: keyof InboxFilters; label: string }[] {
  const out: { key: keyof InboxFilters; label: string }[] = [];
  if (f.waiting)
    out.push({
      key: "waiting",
      label: WAITING_OPTIONS.find((o) => o.value === f.waiting)?.label ?? `Unanswered ${f.waiting}+ min`,
    });
  if (f.attachment) out.push({ key: "attachment", label: ATTACHMENT_LABELS[f.attachment] });
  if (f.date_from) out.push({ key: "date_from", label: `From ${f.date_from}` });
  if (f.date_to) out.push({ key: "date_to", label: `Until ${f.date_to}` });
  if (f.window) out.push({ key: "window", label: f.window === "open" ? "Window open" : "Window closed" });
  if (f.starred) out.push({ key: "starred", label: "Has starred messages" });
  if (f.tag) out.push({ key: "tag", label: `Tag: ${f.tag}` });
  return out;
}

export function FilterPanel({
  open,
  filters,
  assignee,
  onClose,
  onApply,
}: {
  open: boolean;
  filters: InboxFilters;
  /** a team member's id, or "" */
  assignee: string;
  onClose: () => void;
  onApply: (filters: InboxFilters, assignee: string) => void;
}) {
  const [f, setF] = useState<InboxFilters>(filters);
  const [who, setWho] = useState(assignee);
  const tags = useQuery({
    queryKey: INBOX_QK.TAGS,
    queryFn: async () => (await inboxApi.tags()).data,
    staleTime: 60_000,
  });
  const members = useQuery({
    queryKey: TEAM_QK.MEMBERS,
    queryFn: async () => (await teamApi.members()).data,
    staleTime: 60_000,
  });
  const set = (patch: Partial<InboxFilters>) => setF((prev) => ({ ...prev, ...patch }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Filter chats"
      description="Every filter you set must match. They work with the tabs and the search."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setF({});
              setWho("");
            }}
          >
            Clear all
          </Button>
          <Button
            onClick={() => {
              onApply(f, who);
              onClose();
            }}
          >
            Show chats
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Waiting for a reply"
          value={f.waiting ?? ""}
          options={[{ value: "", label: "Any" }, ...WAITING_OPTIONS]}
          onChange={(v) => set({ waiting: v ? Number(v) : undefined })}
        />
        <Select
          label="Has attachments"
          value={f.attachment ?? ""}
          options={[
            { value: "", label: "Any" },
            ...Object.entries(ATTACHMENT_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          onChange={(v) => set({ attachment: (v || undefined) as InboxFilters["attachment"] })}
        />
        <Input
          type="date"
          label="Last message from"
          value={f.date_from ?? ""}
          onChange={(e) => set({ date_from: e.target.value || undefined })}
        />
        <Input
          type="date"
          label="Last message until"
          value={f.date_to ?? ""}
          onChange={(e) => set({ date_to: e.target.value || undefined })}
        />
        <Select
          label="24-hour window"
          value={f.window ?? ""}
          options={[
            { value: "", label: "Any" },
            { value: "open", label: "Open (free replies)" },
            { value: "closed", label: "Closed (templates only)" },
          ]}
          onChange={(v) => set({ window: (v || undefined) as InboxFilters["window"] })}
        />
        <Select
          label="Contact tag"
          value={f.tag ?? ""}
          searchable
          options={[{ value: "", label: "Any" }, ...(tags.data ?? []).map((t) => ({ value: t, label: t }))]}
          onChange={(v) => set({ tag: v || undefined })}
        />
        <Select
          label="Assigned to"
          value={who}
          searchable
          options={[
            { value: "", label: "Use the tabs above" },
            ...(members.data ?? [])
              .filter((m) => m.status === "active" && m.role !== "viewer")
              .map((m) => ({ value: String(m.id), label: m.name || m.email || "Team member" })),
          ]}
          onChange={setWho}
        />
        <div className="sm:pt-7">
          <Checkbox
            label="Has starred messages"
            checked={!!f.starred}
            onChange={(starred) => set({ starred: starred || undefined })}
          />
        </div>
      </div>
    </Modal>
  );
}
