"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button, Skeleton, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import { WA_CALLS_QK, waCallsApi, type WaCallSettings } from "../../_lib/waCallsApi";

function Form({ initial }: { initial: WaCallSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await waCallsApi.saveSettings({
        enabled: form.enabled,
        followup_on: form.followup_on,
        followup_text: form.followup_text,
        permission_text: form.permission_text,
      });
      (res.data.sync_error ? toast.warning : toast.success)(res.message ?? "Saved");
      qc.setQueryData(WA_CALLS_QK.SETTINGS, res.data);
      setForm(res.data);
      void qc.invalidateQueries({ queryKey: ["wa-calls"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border-line space-y-4 border-b p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="bg-success-soft text-success flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <MessageCircle className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-fg text-sm font-semibold">WhatsApp calling</h2>
          <p className="text-fg-subtle text-xs">
            Customers call your WhatsApp number and your team answers in the browser; you can call customers
            who allowed it. Meta has to allow calling for your number (a messaging limit of 2,000+ a day), and
            the &ldquo;calls&rdquo; webhook field must be on in your Meta app.
          </p>
        </div>
      </div>
      <Switch
        label="Turn on WhatsApp calls for this number"
        hint="Saving sends this to Meta. The call button appears in the customer's WhatsApp chat with you."
        checked={form.enabled}
        onChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
      />
      {initial.sync_error && (
        <p className="bg-danger-soft text-danger rounded-lg p-3 text-sm">{initial.sync_error}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Switch
            label="Message after a missed call"
            checked={form.followup_on}
            onChange={(followup_on) => setForm((f) => ({ ...f, followup_on }))}
          />
          {form.followup_on && (
            <Textarea
              aria-label="Message after a missed call"
              rows={3}
              maxLength={1000}
              value={form.followup_text}
              onChange={(e) => setForm((f) => ({ ...f, followup_text: e.target.value }))}
            />
          )}
        </div>
        <Textarea
          label="When asking to call a customer"
          hint="Sent with WhatsApp's Allow button. Customers have to allow calls before you can call them."
          rows={3}
          maxLength={1024}
          value={form.permission_text}
          onChange={(e) => setForm((f) => ({ ...f, permission_text: e.target.value }))}
        />
      </div>
      <div className="flex justify-end">
        <Button loading={saving} onClick={save}>
          Save WhatsApp calling
        </Button>
      </div>
    </section>
  );
}

export function WhatsAppCallingSection() {
  const { data } = useQuery({
    queryKey: WA_CALLS_QK.SETTINGS,
    queryFn: async () => (await waCallsApi.settings()).data,
  });
  if (!data) return <Skeleton className="m-5 h-40 rounded-xl" />;
  return <Form key={JSON.stringify(data)} initial={data} />;
}
