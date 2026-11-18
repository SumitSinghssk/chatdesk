"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button, Input, Select, Skeleton, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { GROWTH_QK, growthApi, type FeedbackSettings, type Journey } from "../../_lib/growthApi";
import { INBOX_QK, inboxApi } from "../../_lib/inboxApi";

function FeedbackForm({ initial }: { initial: FeedbackSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<FeedbackSettings>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await growthApi.saveFeedback({ ...form, review_url: form.review_url?.trim() || null });
      toast.success(res.message ?? "Saved");
      qc.setQueryData(GROWTH_QK.FEEDBACK, res.data);
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div>
        <h2 className="text-fg text-sm font-semibold">Ask customers how it went</h2>
        <p className="text-fg-subtle text-xs">
          A WhatsApp list with 1 to 5 stars. Happy customers (4-5) get a thank-you and your review link;
          unhappy ones (1-2) get an apology, the chat reopens and your team is told. Sent only while the
          24-hour window is open.
        </p>
      </div>
      <Switch label="Ask for feedback" checked={form.enabled} onChange={(enabled) => set({ enabled })} />
      <div className="divide-line border-line divide-y rounded-lg border">
        <div className="p-3">
          <Switch
            label="When a chat is resolved"
            checked={form.on_resolve}
            disabled={!form.enabled}
            onChange={(on_resolve) => set({ on_resolve })}
          />
        </div>
        <div className="p-3">
          <Switch
            label="When an order is delivered"
            checked={form.on_delivered}
            disabled={!form.enabled}
            onChange={(on_delivered) => set({ on_delivered })}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea
          label="Question"
          rows={2}
          maxLength={1000}
          value={form.question}
          onChange={(e) => set({ question: e.target.value })}
        />
        <Input
          label="Review link (optional)"
          placeholder="https://g.page/r/..."
          value={form.review_url ?? ""}
          error={errors.review_url}
          hint="Sent with the thank-you to customers who rate 4 or 5."
          onChange={(e) => set({ review_url: e.target.value })}
        />
        <Textarea
          label="Thank-you (4-5 stars)"
          rows={2}
          maxLength={1000}
          value={form.thanks_text}
          onChange={(e) => set({ thanks_text: e.target.value })}
        />
        <Textarea
          label="Apology (1-2 stars)"
          rows={2}
          maxLength={1000}
          value={form.sorry_text}
          onChange={(e) => set({ sorry_text: e.target.value })}
        />
        <Select
          label="Ask the same customer at most"
          value={String(form.gap_days)}
          options={[1, 3, 7, 14, 30, 60].map((d) => ({
            value: String(d),
            label: d === 1 ? "Once a day" : `Once in ${d} days`,
          }))}
          onChange={(v) => set({ gap_days: Number(v) })}
        />
      </div>
      <div className="flex justify-end">
        <Button loading={saving} onClick={save}>
          Save feedback
        </Button>
      </div>
    </div>
  );
}

export function FeedbackTab() {
  const { data } = useQuery({
    queryKey: GROWTH_QK.FEEDBACK,
    queryFn: async () => (await growthApi.feedback()).data,
  });
  if (!data) return <Skeleton className="m-5 h-64 rounded-xl" />;
  return <FeedbackForm key={JSON.stringify(data)} initial={data} />;
}

function JourneyRow({
  journey,
  templates,
}: {
  journey: Journey;
  templates: { value: number; label: string }[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(journey);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(journey);
  const set = (patch: Partial<Journey>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await growthApi.saveJourney(form.kind, {
        enabled: form.enabled,
        template_id: form.template_id,
        delay_days: form.delay_days,
        send_hour: form.send_hour,
      });
      toast.success(res.message ?? "Saved");
      qc.setQueryData(GROWTH_QK.JOURNEYS, res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Switch
            label={journey.label}
            hint={journey.hint}
            checked={form.enabled}
            onChange={(enabled) => set({ enabled })}
          />
        </div>
        <span className="text-fg-subtle text-xs">{journey.sent_30_days} sent in 30 days</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Template"
          value={form.template_id ?? ""}
          searchable
          options={[{ value: "", label: "Choose a template" }, ...templates]}
          onChange={(v) => set({ template_id: v ? Number(v) : null })}
        />
        {journey.kind !== "birthday" && (
          <Input
            label="Days after delivery"
            inputMode="numeric"
            value={String(form.delay_days)}
            onChange={(e) =>
              set({ delay_days: Math.min(365, Number(e.target.value.replace(/\D/g, "")) || 0) })
            }
          />
        )}
        <Select
          label="Send from"
          value={String(form.send_hour)}
          options={Array.from({ length: 24 }, (_, h) => ({
            value: String(h),
            label: new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" }),
          }))}
          onChange={(v) => set({ send_hour: Number(v) })}
        />
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      )}
    </li>
  );
}

export function JourneysTab() {
  const journeys = useQuery({
    queryKey: GROWTH_QK.JOURNEYS,
    queryFn: async () => (await growthApi.journeys()).data,
  });
  const templates = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    staleTime: 60_000,
  });
  if (!journeys.data) return <Skeleton className="m-5 h-64 rounded-xl" />;
  const options = (templates.data ?? [])
    .filter((t) => t.category !== "authentication")
    .map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }));
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-fg text-sm font-semibold">Journeys</h2>
        <p className="text-fg-subtle text-xs">
          Automatic messages at moments in a customer&apos;s life, each sent once (per order, or per year).
          They use approved templates, whose variables get the customer&apos;s first name, the order number
          and your business name as {"{{1}}, {{2}}, {{3}}"}. Birthdays come from the contact&apos;s
          &ldquo;birthday&rdquo; field (e.g. 1990-03-14 or 14-03). Customers who opted out never get one.
        </p>
      </div>
      <ul className="divide-line border-line divide-y rounded-lg border">
        {journeys.data.map((j) => (
          <JourneyRow key={`${j.kind}-${JSON.stringify(j)}`} journey={j} templates={options} />
        ))}
      </ul>
    </div>
  );
}
