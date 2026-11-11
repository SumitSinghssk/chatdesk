"use client";

import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  EmptyState,
  FilterSelect,
  Input,
  ListToolbar,
  Modal,
  Pagination,
  Skeleton,
  type BadgeTone,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { CALLS_QK, callsApi, type CallLog, type CallOutcome } from "../../_lib/callsApi";

const OUTCOMES: Record<CallOutcome, { label: string; tone: BadgeTone }> = {
  answered: { label: "Answered", tone: "success" },
  missed: { label: "Missed", tone: "danger" },
  not_connected: { label: "Not connected", tone: "warning" },
  pending: { label: "In progress", tone: "info" },
  unknown: { label: "Unknown", tone: "neutral" },
};

const FOLLOW_UP: Record<string, { label: string; tone: BadgeTone }> = {
  sent: { label: "WhatsApp sent", tone: "success" },
  failed: { label: "WhatsApp failed", tone: "danger" },
  skipped: { label: "No message", tone: "neutral" },
};

type OutcomeFilter = "" | CallOutcome;
type DirectionFilter = "" | "inbound" | "outbound";

function duration(seconds: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function StartCallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [agent, setAgent] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setErrors({});
    try {
      const res = await callsApi.start({ to, agent_number: agent || undefined });
      toast.success(res.message ?? "Calling…");
      await queryClient.invalidateQueries({ queryKey: CALLS_QK.LIST });
      setTo("");
      onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Call a customer"
      description="Your phone rings first. When you pick up, the customer is called."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={start} disabled={!to.trim()}>
            Call
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Customer's number"
          name="to"
          inputMode="tel"
          placeholder="e.g. 9876543210"
          value={to}
          error={errors.to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Input
          label="Your phone (optional)"
          name="agent_number"
          inputMode="tel"
          placeholder="Leave empty to use the default from Settings"
          value={agent}
          error={errors.agent_number}
          onChange={(e) => setAgent(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function CallRow({ call }: { call: CallLog }) {
  const outcome = OUTCOMES[call.outcome];
  const follow = call.follow_up ? FOLLOW_UP[call.follow_up] : null;
  const Icon =
    call.outcome === "missed" ? PhoneMissed : call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
  return (
    <li className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)] sm:items-center sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            call.outcome === "missed" ? "bg-red-500/10 text-red-600" : "bg-primary-soft text-primary"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-fg truncate text-sm font-medium">
            {call.contact?.name ?? call.customer_number ?? "Unknown number"}
          </div>
          <div className="text-fg-subtle truncate text-xs">
            {call.direction === "inbound" ? "Incoming" : "Outgoing"}
            {call.contact && call.customer_number ? ` · ${call.customer_number}` : ""} ·{" "}
            {when(call.started_at ?? call.created_at)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={outcome.tone} dot>
          {outcome.label}
        </Badge>
        <span className="text-fg-subtle text-xs">{duration(call.duration)}</span>
        {follow && (
          <span title={call.follow_up_note ?? undefined}>
            <Badge tone={follow.tone}>{follow.label}</Badge>
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {call.recording.available ? (
          <>
            <audio
              controls
              preload="none"
              src={callsApi.recordingUrl(call.id)}
              className="h-9 min-w-0 flex-1"
            />
            <a
              href={callsApi.recordingUrl(call.id, true)}
              className="text-fg-subtle hover:text-fg rounded-lg p-2"
              aria-label="Download the recording"
            >
              <Download className="h-4 w-4" />
            </a>
          </>
        ) : (
          <span className="text-fg-faint text-xs">
            {call.recording.status === "pending"
              ? "Recording is being saved…"
              : call.recording.status === "failed"
                ? "Recording couldn't be saved"
                : "No recording"}
          </span>
        )}
      </div>
    </li>
  );
}

export function CallLogTab({ onSetup }: { onSetup?: () => void }) {
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("");
  const [direction, setDirection] = useState<DirectionFilter>("");
  const [page, setPage] = useState(1);
  const [calling, setCalling] = useState(false);
  const term = useDeferredValue(search.trim());

  const { data: settings } = useQuery({
    queryKey: CALLS_QK.SETTINGS,
    queryFn: async () => (await callsApi.settings()).data,
    enabled: Boolean(onSetup), // managers only: agents can't read the settings
  });
  const { data, isLoading } = useQuery({
    queryKey: [...CALLS_QK.LIST, { term, outcome, direction, page }],
    queryFn: ({ signal }) =>
      callsApi.page(
        { search: term || undefined, outcome: outcome || undefined, direction: direction || undefined, page },
        signal
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000, // calls in progress finish on their own
  });

  const filtered = Boolean(term || outcome || direction);
  return (
    <div>
      {onSetup && settings && !settings.connected && (
        <div className="border-line bg-primary-soft/40 m-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm sm:mx-5">
          <PhoneCall className="text-primary h-4 w-4" aria-hidden />
          <span className="text-fg flex-1">Connect your Exotel account to start logging calls.</span>
          <Button size="sm" onClick={onSetup}>
            Set up calling
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <ListToolbar
            search={search}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or number"
            onReset={
              filtered
                ? () => {
                    setSearch("");
                    setOutcome("");
                    setDirection("");
                    setPage(1);
                  }
                : undefined
            }
          >
            <FilterSelect<OutcomeFilter>
              label="Outcome"
              value={outcome}
              onChange={(v) => {
                setOutcome(v);
                setPage(1);
              }}
              options={[
                { value: "", label: "All outcomes" },
                ...(Object.keys(OUTCOMES) as CallOutcome[]).map((k) => ({
                  value: k,
                  label: OUTCOMES[k].label,
                })),
              ]}
            />
            <FilterSelect<DirectionFilter>
              label="Direction"
              value={direction}
              onChange={(v) => {
                setDirection(v);
                setPage(1);
              }}
              options={[
                { value: "", label: "Incoming and outgoing" },
                { value: "inbound", label: "Incoming" },
                { value: "outbound", label: "Outgoing" },
              ]}
            />
          </ListToolbar>
        </div>
        <Button leftIcon={PhoneOutgoing} onClick={() => setCalling(true)}>
          Call
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4 sm:p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={PhoneCall}
          title={filtered ? "No calls match" : "No calls yet"}
          description={
            filtered
              ? "Try a different search or filter."
              : "Calls you make from here, and calls to your ExoPhone, show up here with their recordings."
          }
          className="py-12"
        />
      ) : (
        <ul className="divide-line border-line mt-4 divide-y border-t">
          {data.items.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </ul>
      )}
      {data?.meta && data.meta.total_pages > 1 && (
        <div className="border-line border-t px-4 py-3 sm:px-5">
          <Pagination meta={data.meta} onPageChange={setPage} unit="calls" />
        </div>
      )}
      <StartCallModal open={calling} onClose={() => setCalling(false)} />
    </div>
  );
}
