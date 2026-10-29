"use client";

import { useContext, useEffect, useState } from "react";
import { Bot, ExternalLink, Megaphone, Search, ShoppingBag, UserRound } from "lucide-react";

import { Input, Modal, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn, timeAgo } from "@/lib/utils";

import type { RecordCard, RecordHit, RecordType } from "../../../_lib/diagramsApi";
import type { ShapeData } from "./model";
import { EditorContext } from "./Shape";

export const RECORD_TYPES: { type: RecordType; label: string; icon: typeof UserRound; color: string }[] = [
  { type: "contact", label: "Contact", icon: UserRound, color: "#16a34a" },
  { type: "order", label: "Order", icon: ShoppingBag, color: "#ea580c" },
  { type: "campaign", label: "Campaign", icon: Megaphone, color: "#2563eb" },
  { type: "chatbot", label: "Chatbot", icon: Bot, color: "#7c3aed" },
];
export const recordKey = (r: { type: string; id: number }) => `${r.type}:${r.id}`;

const STATUS: Record<string, string> = {
  open: "Open chat",
  pending: "Pending",
  resolved: "Resolved",
  draft: "Draft",
  awaiting_address: "Waiting for address",
  awaiting_payment: "Waiting for payment",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  waiting: "Waiting",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  completed: "Sent",
  failed: "Failed",
  live: "Live",
  off: "Off",
};
const GOOD = new Set(["delivered", "completed", "live", "resolved", "confirmed"]);
const BAD = new Set(["cancelled", "failed"]);

const pct = (part: number, of: number) => (of ? Math.round((part / of) * 100) : 0);

/** A card's words, for the canvas and the exported picture alike. */
export function cardText(card: RecordCard | undefined, type: RecordType) {
  const kind = RECORD_TYPES.find((t) => t.type === type)!;
  if (!card) return { title: `${kind.label}…`, badge: null, lines: [] as string[] };
  if (card.missing)
    return { title: `${kind.label} not available`, badge: null, lines: ["Deleted, or not yours to see"] };
  const badge = card.status ? (STATUS[card.status] ?? card.status) : null;
  const lines: string[] = [];
  if (type === "contact") {
    if (card.phone) lines.push(card.phone);
    if (card.preview) lines.push(`“${card.preview}”`);
    if (card.tags?.length) lines.push(card.tags.map((t) => `#${t}`).join(" "));
  } else if (type === "order") {
    lines.push(
      [card.total, card.payment_status ? (card.payment_status === "paid" ? "Paid" : "Unpaid") : null]
        .filter(Boolean)
        .join(" · ")
    );
    if (card.customer)
      lines.push(
        `${card.customer}${card.items ? ` · ${card.items} item${card.items === 1 ? "" : "s"}` : ""}`
      );
  } else if (type === "campaign" && card.report) {
    const r = card.report;
    lines.push(`${r.sent} sent · ${pct(r.read, r.sent)}% read · ${pct(r.replied, r.sent)}% replied`);
  } else if (type === "chatbot") {
    if (card.chats_week !== undefined)
      lines.push(`${card.chats_week} chat${card.chats_week === 1 ? "" : "s"} this week`);
    if (card.keywords?.length) lines.push(`Starts on: ${card.keywords.join(", ")}`);
  }
  if (card.number) lines.push(card.number);
  return { title: card.title ?? kind.label, badge, lines: lines.filter(Boolean) };
}

function Bar({ label, value, of, color }: { label: string; value: number; of: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
      <span className="w-12 shrink-0">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct(value, of)}%`, background: color }}
        />
      </span>
      <span className="w-8 shrink-0 text-right font-semibold text-slate-700 tabular-nums">
        {pct(value, of)}%
      </span>
    </div>
  );
}

/** A live card on the canvas. */
export function RecordCardView({ data }: { data: ShapeData }) {
  const { records } = useContext(EditorContext);
  const ref = data.record;
  if (!ref) return null;
  const kind = RECORD_TYPES.find((t) => t.type === ref.type) ?? RECORD_TYPES[0];
  const card = records?.cards.get(recordKey(ref));
  const text = cardText(card, kind.type);
  const Icon = kind.icon;
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm",
        card?.missing && "border-dashed opacity-70"
      )}
      style={{ borderColor: "#e2e8f0", borderTop: `3px solid ${kind.color}` }}
    >
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: kind.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight font-semibold text-slate-900">
            {text.title}
          </span>
          <span className="block text-[10.5px] text-slate-400">
            {kind.label}
            {card?.last_message_at ? ` · ${timeAgo(card.last_message_at)}` : ""}
          </span>
        </span>
        {text.badge && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              GOOD.has(card?.status ?? "")
                ? "bg-emerald-50 text-emerald-700"
                : BAD.has(card?.status ?? "")
                  ? "bg-red-50 text-red-700"
                  : "bg-slate-100 text-slate-600"
            )}
          >
            {text.badge}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-hidden px-3 pt-1.5 pb-2">
        {!card ? (
          <span className="block h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
        ) : kind.type === "campaign" && card.report ? (
          <>
            <p className="text-[11px] text-slate-500">
              <b className="text-slate-800">{card.report.sent}</b> of {card.report.recipients} sent
            </p>
            <Bar label="Read" value={card.report.read} of={card.report.sent} color="#2563eb" />
            <Bar label="Replied" value={card.report.replied} of={card.report.sent} color="#16a34a" />
          </>
        ) : kind.type === "contact" && card.tags?.length ? (
          <>
            {text.lines
              .filter((l) => !l.startsWith("#"))
              .map((l) => (
                <p key={l} className="truncate text-[11.5px] text-slate-600">
                  {l}
                </p>
              ))}
            <p className="flex flex-wrap gap-1">
              {card.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700"
                >
                  {t}
                </span>
              ))}
            </p>
          </>
        ) : (
          text.lines.map((l, i) => (
            <p
              key={i}
              className={cn(
                "truncate text-[11.5px]",
                i === 0 && kind.type === "order"
                  ? "text-[15px] font-semibold text-slate-900"
                  : "text-slate-600"
              )}
            >
              {l}
            </p>
          ))
        )}
      </div>
      {card?.path && records?.canOpen && (
        <a
          href={card.path}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${text.title}`}
          title="Open in ChatDesk"
          className="nodrag absolute right-2 bottom-1.5 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

/** Picks the contact, order, campaign or chatbot a new card shows. */
export function RecordPicker({
  type: startType,
  search,
  onPick,
  onClose,
  only,
  title = "Add a live card",
}: {
  type: RecordType;
  /** the kinds of record it can pick (all of them when left out) */
  only?: RecordType[];
  title?: string;
  search: (type: RecordType, q: string) => Promise<RecordHit[]>;
  onPick: (type: RecordType, hit: RecordHit) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState(startType);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RecordHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    const t = setTimeout(
      () =>
        search(type, q)
          .then((res) => !stale && (setHits(res), setError(null)))
          .catch((err) => !stale && setError(errorMessage(err))),
      q ? 250 : 0
    );
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [type, q, search]);
  const kind = RECORD_TYPES.find((t) => t.type === type)!;
  return (
    <Modal open onClose={onClose} title={title} size="md">
      <div className="space-y-3">
        <div
          className={cn("grid grid-cols-4 gap-1.5", only && only.length < 2 && "hidden")}
          role="group"
          aria-label="What it shows"
        >
          {RECORD_TYPES.filter((t) => !only || only.includes(t.type)).map((t) => (
            <button
              key={t.type}
              type="button"
              aria-pressed={t.type === type}
              onClick={() => {
                setType(t.type);
                setHits(null);
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition",
                t.type === type
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line text-fg-muted hover:bg-hover"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
        <Input
          autoFocus
          leftIcon={Search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            type === "contact"
              ? "Name or number"
              : type === "order"
                ? "Order number or customer"
                : `${kind.label} name`
          }
          aria-label={`Find a ${kind.label.toLowerCase()}`}
        />
        <div className="border-line max-h-72 min-h-32 overflow-y-auto rounded-lg border">
          {error ? (
            <p className="text-danger p-4 text-sm">{error}</p>
          ) : hits === null ? (
            <Spinner className="h-32" />
          ) : hits.length === 0 ? (
            <p className="text-fg-subtle p-6 text-center text-sm">Nothing found.</p>
          ) : (
            <ul className="divide-line divide-y">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onPick(type, h)}
                    className="hover:bg-hover flex w-full items-center gap-3 px-3 py-2 text-left"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: kind.color }}
                    >
                      <kind.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-fg block truncate text-sm font-medium">{h.title}</span>
                      <span className="text-fg-subtle block truncate text-xs">{h.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-fg-faint text-xs">
          The card stays up to date. People outside your team only see it without private details.
        </p>
      </div>
    </Modal>
  );
}
