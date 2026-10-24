"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  MessageCircle,
  RefreshCw,
  Save,
  SendHorizontal,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Input,
  Modal,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { TagInput } from "../../../_components/TagInput";
import {
  AI_QK,
  aiAgentApi,
  type Agent,
  type ChannelsInput,
  type WidgetChannel,
} from "../../../_lib/aiAgentApi";

function useOrigin() {
  return useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => siteConfig.url
  );
}

function Copyable({ value, label, multiline }: { value: string; label: string; multiline?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => null);
    setDone(true);
    toast.success(`${label} copied`);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <div className="border-line bg-surface-2 relative rounded-xl border">
      <pre
        className={cn(
          "text-fg overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed",
          !multiline && "break-all whitespace-pre-wrap"
        )}
      >
        {value}
      </pre>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        leftIcon={done ? Check : Copy}
        aria-label={`Copy ${label}`}
        onClick={copy}
        className="absolute top-2 right-2"
      />
    </div>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  description,
  on,
  onToggle,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3 p-5">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            on ? "bg-success-soft text-success" : "bg-hover text-fg-subtle"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg flex flex-wrap items-center gap-2 text-base font-semibold">
            {title}{" "}
            {on ? (
              <Badge tone="success" dot>
                On
              </Badge>
            ) : (
              <Badge>Off</Badge>
            )}{" "}
            {badge}
          </p>
          <p className="text-fg-subtle text-sm">{description}</p>
        </div>
        <Switch checked={on} onChange={onToggle} aria-label={`${title} on`} />
      </div>
      <div className="border-line space-y-4 border-t px-5 py-4">{children}</div>
    </Card>
  );
}

/** A live, static picture of the website chat with the current look. */
export function WidgetPreview({ widget, name }: { widget: WidgetChannel; name: string }) {
  const left = widget.position === "left";
  return (
    <div
      className="border-line relative h-[460px] overflow-hidden rounded-xl border bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900"
      aria-label="Widget preview"
    >
      <div className="flex items-center gap-1.5 border-b border-black/5 bg-white/70 px-3 py-2 dark:border-white/5 dark:bg-black/20">
        {["bg-red-400", "bg-amber-400", "bg-emerald-400"].map((c) => (
          <span key={c} className={cn("h-2.5 w-2.5 rounded-full", c)} />
        ))}
        <span className="text-fg-subtle ml-2 truncate rounded bg-black/5 px-2 py-0.5 text-[10px] dark:bg-white/10">
          {widget.allowed_domains[0] ?? "yourwebsite.com"}
        </span>
      </div>
      <div className="space-y-2 p-4 opacity-40" aria-hidden>
        <div className="h-3 w-1/3 rounded bg-slate-400/60" />
        <div className="h-2 w-2/3 rounded bg-slate-400/40" />
        <div className="h-2 w-1/2 rounded bg-slate-400/40" />
      </div>
      <div
        className={cn(
          "absolute bottom-20 w-[min(300px,85%)] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900",
          left ? "left-4" : "right-4"
        )}
      >
        <div className="flex items-center gap-2 px-3 py-3 text-white" style={{ background: widget.color }}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-sm font-semibold">
            {(name || "A").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold">{widget.title || "Chat with us"}</span>
            <span className="block truncate text-[11px] opacity-85">{widget.subtitle}</span>
          </span>
          <X className="h-4 w-4 opacity-80" aria-hidden />
        </div>
        <div className="space-y-2 bg-slate-50 p-3 dark:bg-slate-950">
          <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-xs text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-100">
            {widget.greeting}
          </p>
          {widget.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {widget.suggestions.map((s) => (
                <span
                  key={s}
                  className="rounded-full border bg-white px-2 py-0.5 text-[10px] dark:bg-slate-800"
                  style={{ borderColor: widget.color, color: widget.color }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {widget.lead !== "off" && (
            <div className="space-y-1 rounded-xl bg-white p-2 text-[10px] text-slate-500 shadow-xs dark:bg-slate-800">
              {widget.lead_fields.map((f) => (
                <div
                  key={f}
                  className="rounded border border-slate-200 px-2 py-1 capitalize dark:border-slate-700"
                >
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
          <span className="flex-1 text-[11px] text-slate-400">Type a message…</span>
          <SendHorizontal className="h-4 w-4" style={{ color: widget.color }} aria-hidden />
        </div>
        {widget.whatsapp_button && (
          <p className="border-t border-slate-100 py-1.5 text-center text-[10px] font-medium text-[#128c7e] dark:border-slate-800">
            Continue on WhatsApp
          </p>
        )}
        {widget.branding && (
          <p className="pb-1.5 text-center text-[9px] text-slate-400">Powered by ChatDesk</p>
        )}
      </div>
      <span
        className={cn(
          "absolute bottom-4 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg",
          left ? "left-4" : "right-4"
        )}
        style={{ background: widget.color }}
      >
        <MessageCircle className="h-5 w-5" aria-hidden />
        {widget.launcher_text}
      </span>
    </div>
  );
}

export function Channels({ agent }: { agent: Agent }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const site = useOrigin();
  const initial: ChannelsInput = {
    whatsapp_enabled: agent.whatsapp_enabled,
    whatsapp: agent.whatsapp,
    widget_enabled: agent.widget_enabled,
    widget: agent.widget,
    api_enabled: agent.api_enabled,
  };
  const [form, setForm] = useState<ChannelsInput>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== saved;
  const w = form.widget;
  const setW = (patch: Partial<WidgetChannel>) =>
    setForm((f) => ({ ...f, widget: { ...f.widget, ...patch } }));
  const setWa = (patch: Partial<ChannelsInput["whatsapp"]>) =>
    setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, ...patch } }));
  const key = agent.public_key;
  const script = `<script src="${site}/widget.js" data-agent="${key}" async></script>`;
  const link = `${site}/ai-chat/${key}`;
  const curl = `curl -X POST ${site}/api/v1/website/ai/${key}/messages \\
  -H "Authorization: Bearer ${secret ?? "YOUR_API_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What are your timings?", "user": {"name": "Ravi", "phone": "+919876543210"}}'`;

  const save = async (next = form) => {
    setSaving(true);
    setErrors({});
    try {
      const res = await aiAgentApi.channels(agent.id, next);
      qc.setQueryData(AI_QK.AGENT(agent.id), res.data);
      void qc.invalidateQueries({ queryKey: AI_QK.AGENTS });
      setSaved(JSON.stringify(next));
      setForm(next);
      toast.success("Saved");
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const newSecret = async () => {
    if (agent.secret_hint) {
      const ok = await confirm({
        title: "Create a new API key?",
        message: "The old key stops working at once. Update it everywhere you use it.",
        confirmLabel: "Create new key",
        variant: "warning",
      });
      if (!ok) return;
    }
    try {
      const res = await aiAgentApi.secret(agent.id);
      qc.setQueryData(AI_QK.AGENT(agent.id), res.data.agent);
      setSecret(res.data.secret);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const rekey = async () => {
    const ok = await confirm({
      title: "Change the website key?",
      message: "The chat stops working on websites that use the old script until you paste the new one.",
      confirmLabel: "Change key",
      variant: "warning",
    });
    if (!ok) return;
    try {
      const res = await aiAgentApi.publicKey(agent.id);
      qc.setQueryData(AI_QK.AGENT(agent.id), res.data);
      toast.success(res.message ?? "New key");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      {agent.problem && (
        <p className="bg-warning-soft text-warning flex items-start gap-2 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {agent.problem}
        </p>
      )}

      <ChannelCard
        icon={MessageCircle}
        title="WhatsApp"
        description="Answers customers on your WhatsApp number. Only one agent can answer it."
        on={form.whatsapp_enabled}
        onToggle={(whatsapp_enabled) => setForm((f) => ({ ...f, whatsapp_enabled }))}
      >
        <p className="bg-info-soft text-info rounded-lg px-3 py-2 text-xs">
          While it&apos;s on, the agent takes the place of your welcome, away and default automatic replies.
          Opt-out words, chatbots and keyword replies still go first. When someone from your team replies in a
          chat, the agent steps back; you can pause or resume it for any chat from the inbox.
        </p>
        <RadioGroup
          label="When it answers"
          value={form.whatsapp.mode}
          onChange={(mode) => setWa({ mode })}
          columns={2}
          options={[
            { value: "always", label: "Always, 24/7", description: "Your team joins in when needed" },
            {
              value: "outside_hours",
              label: "Outside office hours",
              description: "Or when nobody in the team is available",
            },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="After your team replies in a chat"
            value={String(form.whatsapp.pause_hours)}
            onChange={(v) => setWa({ pause_hours: Number(v) })}
            options={[
              { value: "1", label: "Stay quiet for 1 hour" },
              { value: "4", label: "Stay quiet for 4 hours" },
              { value: "12", label: "Stay quiet for 12 hours" },
              { value: "24", label: "Stay quiet for 24 hours" },
              { value: "72", label: "Stay quiet for 3 days" },
              { value: "0", label: "Stay quiet until the chat is resolved" },
            ]}
          />
          <Input
            label="Reply to photos, voice notes and files"
            value={form.whatsapp.media_reply}
            onChange={(e) => setWa({ media_reply: e.target.value })}
            hint="Leave empty to say nothing."
          />
        </div>
      </ChannelCard>

      <ChannelCard
        icon={Globe}
        title="Website chat"
        description="A chat bubble on your website, or a chat page you can link to from anywhere."
        on={form.widget_enabled}
        onToggle={(widget_enabled) => setForm((f) => ({ ...f, widget_enabled }))}
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Title" value={w.title} onChange={(e) => setW({ title: e.target.value })} />
              <Input
                label="Subtitle"
                value={w.subtitle}
                onChange={(e) => setW({ subtitle: e.target.value })}
              />
            </div>
            <Textarea
              label="Greeting"
              rows={2}
              value={w.greeting}
              onChange={(e) => setW({ greeting: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <ColorInput label="Colour" value={w.color} onChange={(color) => setW({ color })} />
              <Select
                label="Position"
                value={w.position}
                onChange={(v) => setW({ position: v as WidgetChannel["position"] })}
                options={[
                  { value: "right", label: "Bottom right" },
                  { value: "left", label: "Bottom left" },
                ]}
              />
              <Select
                label="Theme"
                value={w.theme}
                onChange={(v) => setW({ theme: v as WidgetChannel["theme"] })}
                options={[
                  { value: "auto", label: "Match the visitor" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </div>
            <Input
              label="Text beside the bubble (optional)"
              value={w.launcher_text}
              onChange={(e) => setW({ launcher_text: e.target.value })}
              placeholder="e.g. Need help?"
            />
            <div>
              <p className="text-fg mb-1.5 text-sm font-medium">Suggested questions</p>
              <div className="flex flex-wrap gap-1.5">
                {w.suggestions.map((s) => (
                  <span
                    key={s}
                    className="bg-hover text-fg inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs"
                  >
                    {s}
                    <button
                      type="button"
                      aria-label={`Remove ${s}`}
                      onClick={() => setW({ suggestions: w.suggestions.filter((x) => x !== s) })}
                      className="hover:bg-surface rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              {w.suggestions.length < 4 && (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (suggestion.trim()) setW({ suggestions: [...w.suggestions, suggestion.trim()] });
                    setSuggestion("");
                  }}
                >
                  <Input
                    aria-label="New suggested question"
                    value={suggestion}
                    onChange={(e) => setSuggestion(e.target.value)}
                    placeholder="e.g. What are your prices?"
                    wrapperClassName="flex-1"
                  />
                  <Button type="submit" variant="secondary" disabled={!suggestion.trim()}>
                    Add
                  </Button>
                </form>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Ask for the visitor's details"
                value={w.lead}
                onChange={(v) => setW({ lead: v as WidgetChannel["lead"] })}
                options={[
                  { value: "off", label: "Don't ask" },
                  { value: "optional", label: "Ask, but they can skip" },
                  { value: "required", label: "Required before chatting" },
                ]}
                hint="A visitor who leaves a phone number is saved in Contacts."
              />
              {w.lead !== "off" && (
                <div className="space-y-1.5 sm:pt-6">
                  {(["name", "phone", "email"] as const).map((f) => (
                    <Checkbox
                      key={f}
                      checked={w.lead_fields.includes(f)}
                      label={f[0]!.toUpperCase() + f.slice(1)}
                      onChange={(on) =>
                        setW({
                          lead_fields: on ? [...w.lead_fields, f] : w.lead_fields.filter((x) => x !== f),
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
            <TagInput
              label="Websites it may appear on"
              value={w.allowed_domains}
              onChange={(allowed_domains) => setW({ allowed_domains })}
              placeholder="example.com or *.example.com, then Enter"
              id="allowed-domains"
            />
            <p className="text-fg-subtle -mt-2 text-xs">
              Leave empty to allow any website.
              {errors["widget.allowed_domains"] ? ` ${errors["widget.allowed_domains"]}` : ""}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Switch
                checked={w.whatsapp_button}
                onChange={(whatsapp_button) => setW({ whatsapp_button })}
                label="“Continue on WhatsApp” button"
              />
              <Switch
                checked={w.branding}
                onChange={(branding) => setW({ branding })}
                label="Show “Powered by ChatDesk”"
              />
            </div>
          </div>
          <div>
            <div className="space-y-2 sticky top-0">
              <p className="text-fg text-sm font-medium">Preview</p>
              <WidgetPreview widget={w} name={agent.name} />
            </div>
          </div>
        </div>
        <div className="border-line space-y-3 border-t pt-4">
          <p className="text-fg flex items-center gap-1.5 text-sm font-semibold">
            <Code2 className="text-primary h-4 w-4" aria-hidden /> Add it to your website
          </p>
          <p className="text-fg-subtle text-xs">
            Paste this before <code>&lt;/body&gt;</code> on every page (WordPress, Shopify, Wix, Webflow and
            plain HTML all work).
          </p>
          <Copyable value={script} label="Website script" />
          <p className="text-fg flex items-center gap-1.5 pt-1 text-sm font-semibold">
            <Link2 className="text-primary h-4 w-4" aria-hidden /> Or share a chat link
          </p>
          <p className="text-fg-subtle text-xs">
            For Instagram bio, Google Business, QR codes, emails, anywhere.
          </p>
          <Copyable value={link} label="Chat link" />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={ExternalLink}
              href={link}
              target="_blank"
              disabled={!agent.widget_enabled}
            >
              Open the chat page
            </Button>
            <Button size="sm" variant="ghost" leftIcon={RefreshCw} onClick={rekey}>
              Change website key
            </Button>
          </div>
          {!agent.widget_enabled && (
            <p className="text-fg-subtle text-xs">Turn the website chat on and save to try it.</p>
          )}
        </div>
      </ChannelCard>

      <ChannelCard
        icon={Code2}
        title="API"
        description="Use the agent from your own app, website backend, CRM or another chatbot."
        on={form.api_enabled}
        onToggle={(api_enabled) => setForm((f) => ({ ...f, api_enabled }))}
        badge={agent.secret_hint ? <Badge>{agent.secret_hint}</Badge> : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" leftIcon={KeyRound} onClick={newSecret}>
            {agent.secret_hint ? "Create a new API key" : "Create API key"}
          </Button>
          <span className="text-fg-subtle text-xs">
            Keep it secret: use it only from servers, never in website code.
          </span>
        </div>
        <Copyable value={curl} label="Example request" multiline />
        <p className="text-fg-subtle text-xs">
          The reply has <code>reply</code>, <code>thread</code> (send it back to continue the same
          conversation, with memory), <code>handover</code> and <code>sources</code>.
        </p>
      </ChannelCard>

      {dirty && (
        <div className="border-line bg-surface/95 sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur">
          <span className="text-fg-subtle mr-auto text-sm">You have unsaved changes</span>
          <Button variant="secondary" onClick={() => setForm(JSON.parse(saved))} disabled={saving}>
            Discard
          </Button>
          <Button leftIcon={Save} onClick={() => save()} loading={saving}>
            Save changes
          </Button>
        </div>
      )}

      {secret && (
        <Modal
          open
          variant="modal"
          size="md"
          onClose={() => setSecret(null)}
          title="Your new API key"
          description="Copy it now. For your security it won't be shown again."
          footer={
            <div className="flex w-full justify-end">
              <Button onClick={() => setSecret(null)} leftIcon={Sparkles}>
                I&apos;ve copied it
              </Button>
            </div>
          }
        >
          <Copyable value={secret} label="API key" />
          {!form.api_enabled && (
            <p className="text-fg-subtle mt-3 text-xs">Turn the API on and save to start using it.</p>
          )}
        </Modal>
      )}
    </div>
  );
}
