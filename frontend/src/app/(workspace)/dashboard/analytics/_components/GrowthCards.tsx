"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Settings2, Star, Timer, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, Input, Modal } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import type { AnalyticsReport } from "../../_lib/analyticsApi";
import { GROWTH_QK, growthApi, type Spend, type SpendCategory } from "../../_lib/growthApi";

const CATEGORY_LABELS: Record<SpendCategory, string> = {
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
  service: "Service (free)",
};

function wait(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

function Box({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Star;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-fg mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="text-primary h-4 w-4" aria-hidden /> {title}
      </h3>
      {children}
    </Card>
  );
}

/** Ratings, WhatsApp calls and the slowest replies for the period. */
export function GrowthCards({ r }: { r: AnalyticsReport }) {
  const f = r.feedback;
  const c = r.calls;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Box title="Customer ratings" icon={Star}>
        {f && f.answered ? (
          <div className="space-y-2 text-sm">
            <p className="text-fg text-2xl font-semibold tabular-nums">
              {f.csat}%<span className="text-fg-subtle ml-1 text-xs font-normal">rated 4-5</span>
            </p>
            <p className="text-fg-subtle text-xs">
              Average {f.average}/5 · {f.answered} of {f.asked} answered
              {f.unhappy ? ` · ${f.unhappy} unhappy` : ""}
            </p>
            {f.by_member.length > 0 && (
              <ul className="divide-line divide-y text-xs">
                {f.by_member.map((m) => (
                  <li key={m.id} className="flex justify-between py-1">
                    <span className="text-fg truncate">{m.name}</span>
                    <span className="text-fg-subtle tabular-nums">
                      {m.average}/5 · {m.ratings}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-fg-subtle text-xs">
            No ratings in this period. Turn on feedback in{" "}
            <Link href={CUSTOMER_ROUTES.AUTOMATION()} className="text-primary hover:underline">
              Automation → Feedback
            </Link>
            .
          </p>
        )}
      </Box>
      <Box title="WhatsApp calls" icon={PhoneCall}>
        {c && c.total ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Answered", c.answered],
              ["Missed", c.missed],
              ["Outgoing", c.outgoing],
              ["Average length", c.avg_seconds ? wait(c.avg_seconds) : "—"],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-fg-subtle text-xs">{label}</dt>
                <dd
                  className={cn(
                    "text-fg font-semibold tabular-nums",
                    label === "Missed" && c.missed && "text-danger"
                  )}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-fg-subtle text-xs">No WhatsApp calls in this period.</p>
        )}
      </Box>
      <Box title="Slowest first replies" icon={Timer}>
        {r.slowest?.length ? (
          <ul className="divide-line divide-y text-xs">
            {r.slowest.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1">
                <Link
                  href={CUSTOMER_ROUTES.INBOX({ c: s.conversation_id })}
                  className="text-fg hover:text-primary min-w-0 truncate"
                >
                  {s.contact}
                </Link>
                <span className="text-fg-subtle shrink-0 tabular-nums">
                  {wait(s.seconds)}
                  {s.by ? ` · ${s.by}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-subtle text-xs">No replies in this period.</p>
        )}
      </Box>
    </div>
  );
}

function SpendSettings({ spend, onClose }: { spend: Spend; onClose: () => void }) {
  const qc = useQueryClient();
  const [currency, setCurrency] = useState(spend.currency);
  const [rates, setRates] = useState(
    Object.fromEntries(Object.entries(spend.rates).map(([k, v]) => [k, String(v)])) as Record<
      SpendCategory,
      string
    >
  );
  const [budget, setBudget] = useState(spend.monthly_budget ? String(spend.monthly_budget) : "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const res = await growthApi.saveSpend({
        currency,
        rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Number(v) || 0])),
        monthly_budget: budget.trim() ? Number(budget) : null,
      });
      qc.setQueryData(GROWTH_QK.SPEND, res.data);
      toast.success(res.message ?? "Saved");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const num = (v: string) => v.replace(/[^\d.]/g, "");
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="WhatsApp spend"
      description="Meta charges per message by category, and the price depends on the customer's country. Put in the rates from Meta's rate card for your main market."
      footer={
        <Button loading={saving} onClick={save}>
          Save
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Currency"
          maxLength={3}
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
        <Input
          label="Monthly budget"
          inputMode="decimal"
          placeholder="No budget"
          hint="Owners and admins are told at 80% and 100%."
          value={budget}
          onChange={(e) => setBudget(num(e.target.value))}
        />
        {(["marketing", "utility", "authentication"] as SpendCategory[]).map((k) => (
          <Input
            key={k}
            label={`${CATEGORY_LABELS[k]} (per message)`}
            inputMode="decimal"
            value={rates[k] ?? ""}
            onChange={(e) => setRates((r) => ({ ...r, [k]: num(e.target.value) }))}
          />
        ))}
      </div>
    </Modal>
  );
}

/** This month's estimated WhatsApp spend against the budget (owners and admins). */
export function SpendCard() {
  const [editing, setEditing] = useState(false);
  const { data } = useQuery({
    queryKey: GROWTH_QK.SPEND,
    queryFn: async () => (await growthApi.spend()).data,
  });
  if (!data) return null;
  const used = data.month.used_percent;
  const money = (n: number) => `${n.toFixed(2)} ${data.currency}`;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-fg flex flex-1 items-center gap-2 text-sm font-semibold">
          <Wallet className="text-primary h-4 w-4" aria-hidden /> WhatsApp spend this month
        </h3>
        <Button
          iconOnly
          size="xs"
          variant="ghost"
          leftIcon={Settings2}
          aria-label="Spend settings"
          onClick={() => setEditing(true)}
        />
      </div>
      <p className="text-fg text-2xl font-semibold tabular-nums">
        {money(data.month.spent)}
        {data.monthly_budget ? (
          <span className="text-fg-subtle ml-1 text-xs font-normal">of {money(data.monthly_budget)}</span>
        ) : null}
      </p>
      {used !== null && (
        <div className="bg-hover mt-2 h-2 overflow-hidden rounded-full" aria-label={`${used}% of the budget`}>
          <div
            className={cn(
              "h-full rounded-full",
              used >= 100 ? "bg-danger" : used >= 80 ? "bg-warning" : "bg-primary"
            )}
            style={{ width: `${Math.min(100, used)}%` }}
          />
        </div>
      )}
      <ul className="text-fg-subtle mt-3 space-y-0.5 text-xs">
        {(Object.keys(CATEGORY_LABELS) as SpendCategory[]).map((k) => (
          <li key={k} className="flex justify-between">
            <span>{CATEGORY_LABELS[k]}</span>
            <span className="tabular-nums">
              {data.month.by_category[k]?.messages ?? 0} · {money(data.month.by_category[k]?.cost ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-fg-faint mt-2 text-[11px]">
        Estimate from Meta&apos;s billing category on each message × your rates. Last month:{" "}
        {money(data.previous_month.spent)}.
      </p>
      {editing && <SpendSettings spend={data} onClose={() => setEditing(false)} />}
    </Card>
  );
}
