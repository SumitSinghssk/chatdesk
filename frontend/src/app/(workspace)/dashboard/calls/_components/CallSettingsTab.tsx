"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mic, PhoneCall, PlugZap, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Input, Select, Skeleton, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { CALLS_QK, callsApi, type CallRule, type CallSettings } from "../../_lib/callsApi";
import { INBOX_QK, inboxApi } from "../../_lib/inboxApi";

const VARIABLES = "{name} {business} {time} {duration}";

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="border-line space-y-4 border-t p-4 first:border-t-0 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-fg text-sm font-semibold">{title}</h2>
          <p className="text-fg-subtle text-xs">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Connection({ settings }: { settings: CallSettings }) {
  const queryClient = useQueryClient();
  const provider = settings.providers.find((p) => p.key === settings.provider) ?? settings.providers[0]!;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      provider.fields.map((f) => [f.name, f.secret ? "" : String(settings.config[f.name] ?? f.default ?? "")])
    )
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "disconnect" | null>(null);

  const refresh = (data: CallSettings | undefined) => {
    if (data) queryClient.setQueryData(CALLS_QK.SETTINGS, data);
  };
  const save = async () => {
    setBusy("save");
    setErrors({});
    try {
      const res = await callsApi.connect({ provider: provider.key, config: values });
      (res.data?.connected ? toast.success : toast.warning)(res.message ?? "Saved");
      refresh(res.data);
      setValues((v) => ({
        ...v,
        ...Object.fromEntries(provider.fields.filter((f) => f.secret).map((f) => [f.name, ""])),
      }));
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const disconnect = async () => {
    if (!window.confirm(`Disconnect ${provider.label}? Calls stop being logged until you connect again.`))
      return;
    setBusy("disconnect");
    try {
      const res = await callsApi.disconnect();
      toast.success(res.message ?? "Disconnected");
      refresh(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  };

  return (
    <Section
      title={`${provider.label} account`}
      description={
        <>
          Use your own {provider.label} account: you sign up and finish KYC with {provider.label}, and they
          bill you for calls.{" "}
          <a
            href={provider.website}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Open {provider.label}
          </a>
        </>
      }
      icon={PlugZap}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {settings.status === "connected" ? (
          <Badge tone="success" dot>
            Connected
          </Badge>
        ) : settings.status === "error" ? (
          <Badge tone="danger" dot>
            Not working
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Not connected
          </Badge>
        )}
        {settings.last_event_at && (
          <span className="text-fg-subtle text-xs">
            Last call report {new Date(settings.last_event_at).toLocaleString()}
          </span>
        )}
      </div>
      {settings.last_error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600">
          {settings.last_error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {provider.fields.map((f) =>
          f.options.length ? (
            <Select
              key={f.name}
              label={f.label}
              value={values[f.name] ?? ""}
              options={f.options}
              onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
            />
          ) : (
            <Input
              key={f.name}
              label={f.label}
              name={f.name}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              required={f.required}
              placeholder={f.secret && settings.config[f.name] ? "Saved. Leave empty to keep it." : undefined}
              hint={f.help || undefined}
              value={values[f.name] ?? ""}
              error={errors[`config.${f.name}`]}
              onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
            />
          )
        )}
      </div>
      {settings.callback_url && (
        <div className="border-line bg-page/60 space-y-2 rounded-lg border p-3">
          <div className="text-fg text-xs font-semibold">Callback URL for incoming calls</div>
          <div className="flex items-center gap-2">
            <code className="text-fg min-w-0 flex-1 truncate font-mono text-xs">{settings.callback_url}</code>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={Copy}
              onClick={() => copy(settings.callback_url!)}
            >
              Copy
            </Button>
          </div>
          <p className="text-fg-subtle text-xs">{provider.setup_help}</p>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {settings.status && settings.status !== "pending" && (
          <Button variant="secondary" loading={busy === "disconnect"} onClick={disconnect}>
            Disconnect
          </Button>
        )}
        <Button loading={busy === "save"} onClick={save}>
          {settings.connected ? "Save and test" : `Connect ${provider.label}`}
        </Button>
      </div>
    </Section>
  );
}

function RuleRow({
  title,
  hint,
  rule,
  onChange,
  templates,
  errors,
  prefix,
}: {
  title: string;
  hint: string;
  rule: CallRule;
  onChange: (rule: CallRule) => void;
  templates: { value: number; label: string }[];
  errors: Record<string, string>;
  prefix: "answered" | "missed";
}) {
  return (
    <li className="space-y-3 p-3">
      <Switch label={title} hint={hint} checked={rule.on} onChange={(on) => onChange({ ...rule, on })} />
      {rule.on && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Textarea
            label="Message (chat open)"
            rows={3}
            maxLength={1000}
            placeholder={`e.g. Hi {name}, thanks for talking to {business}!`}
            hint={`Sent if they messaged you in the last 24 hours. You can use ${VARIABLES}.`}
            value={rule.text}
            error={errors[`${prefix}.text`]}
            onChange={(e) => onChange({ ...rule, text: e.target.value })}
          />
          <Select
            label="Template (chat closed)"
            value={rule.template_id ?? ""}
            hint="WhatsApp only allows approved templates outside the 24-hour window."
            error={errors[`${prefix}.template_id`]}
            options={[{ value: "", label: "Don't send" }, ...templates]}
            onChange={(v) => onChange({ ...rule, template_id: v ? Number(v) : null })}
          />
        </div>
      )}
    </li>
  );
}

function Rules({ settings }: { settings: CallSettings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    answered: settings.answered,
    missed: settings.missed,
    min_answered_seconds: String(settings.min_answered_seconds),
    record_calls: settings.record_calls,
    save_recordings: settings.save_recordings,
    agent_number: settings.agent_number ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: all } = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    staleTime: 60_000,
  });
  // templates whose buttons need their own value can't be filled after a call
  const templates = (all ?? [])
    .filter((t) => t.category !== "authentication" && !t.params.buttons.length)
    .map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }));
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await callsApi.saveSettings({
        answered: form.answered,
        missed: form.missed,
        min_answered_seconds: Number(form.min_answered_seconds) || 0,
        record_calls: form.record_calls,
        save_recordings: form.save_recordings,
        agent_number: form.agent_number.trim() || null,
      });
      toast.success(res.message ?? "Saved");
      if (res.data) queryClient.setQueryData(CALLS_QK.SETTINGS, res.data);
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section
        title="WhatsApp message after a call"
        description="Choose what the customer gets on WhatsApp when a call is answered or missed. Turn either off to send nothing."
        icon={PhoneCall}
      >
        <ul className="divide-line border-line divide-y rounded-lg border">
          <RuleRow
            title="When the call is answered"
            hint="The customer and your team talked."
            prefix="answered"
            rule={form.answered}
            templates={templates}
            errors={errors}
            onChange={(answered) => set({ answered })}
          />
          <RuleRow
            title="When the call is missed"
            hint="Nobody picked up, the line was busy, or the call was too short to count."
            prefix="missed"
            rule={form.missed}
            templates={templates}
            errors={errors}
            onChange={(missed) => set({ missed })}
          />
        </ul>
        <p className="text-fg-faint text-xs">
          Template variables get the customer&apos;s first name, your business name, the call time and its
          length as
          {" {{1}}, {{2}}, {{3}}, {{4}}"}.
        </p>
      </Section>

      <Section title="Recordings and calling" description="How calls are recorded and placed." icon={Mic}>
        <div className="divide-line border-line divide-y rounded-lg border">
          <div className="p-3">
            <Switch
              label="Record calls you make from here"
              hint="Calls to your ExoPhone follow the recording setting of its Flow in Exotel."
              checked={form.record_calls}
              onChange={(record_calls) => set({ record_calls })}
            />
          </div>
          <div className="p-3">
            <Switch
              label="Keep a copy of recordings here"
              hint="Downloaded from Exotel after each call, so they stay after Exotel deletes them."
              checked={form.save_recordings}
              onChange={(save_recordings) => set({ save_recordings })}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Your phone for click-to-call"
            name="agent_number"
            inputMode="tel"
            placeholder="e.g. 919876543210"
            hint="It rings first when you press Call. Anyone can enter another number when calling."
            value={form.agent_number}
            error={errors.agent_number}
            onChange={(e) => set({ agent_number: e.target.value })}
          />
          <Input
            label="Count as answered after (seconds)"
            name="min_answered_seconds"
            inputMode="numeric"
            hint="Shorter calls count as missed, e.g. voicemail or a 'switched off' message."
            value={form.min_answered_seconds}
            error={errors.min_answered_seconds}
            onChange={(e) => set({ min_answered_seconds: e.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div className="flex justify-end">
          <Button loading={saving} onClick={save}>
            Save call settings
          </Button>
        </div>
      </Section>
    </>
  );
}

export function CallSettingsTab() {
  const { data } = useQuery({
    queryKey: CALLS_QK.SETTINGS,
    queryFn: async () => (await callsApi.settings()).data,
  });
  if (!data) return <Skeleton className="m-5 h-64 rounded-xl" />;
  return (
    <div>
      <Connection key={`c-${data.provider}-${data.status}`} settings={data} />
      <Rules key={`r-${JSON.stringify([data.answered, data.missed])}`} settings={data} />
    </div>
  );
}
