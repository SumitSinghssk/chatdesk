"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button, Input, Modal, Select, Switch } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { TagInput } from "../../_components/TagInput";
import { ChatBackdrop, TemplateBubble } from "../../_components/whatsapp/TemplatePreview";
import {
  automationApi,
  type MatchType,
  type Rule,
  type RuleInput,
  type Trigger,
} from "../../_lib/automationApi";
import { Segmented } from "../../templates/_components/editor/parts";
import { previewOf, ReplyFields } from "./ReplyFields";

export const TRIGGERS: Record<Trigger, { label: string; hint: string }> = {
  keyword: { label: "Keyword reply", hint: "When a message contains one of your keywords." },
  welcome: { label: "Welcome message", hint: "The first time someone ever messages you." },
  away: { label: "Away message", hint: "When someone writes outside your office hours." },
  default: { label: "Default reply", hint: "When nothing else answered the message." },
};

/** {{first_name}} / {{name}} in previews */
export const SAMPLE_NAMES = { body: { first_name: "Asha", name: "Asha Verma" }, header: {} };

const COOLDOWNS = [
  { value: "0", label: "Every time" },
  { value: "60", label: "At most once an hour" },
  { value: "240", label: "At most once every 4 hours" },
  { value: "720", label: "At most once every 12 hours" },
  { value: "1440", label: "At most once a day" },
  { value: "10080", label: "At most once a week" },
];

const BLANK: Record<Trigger, Omit<RuleInput, "trigger">> = {
  keyword: {
    name: "",
    match: "contains",
    keywords: [],
    reply: { type: "text", text: "" },
    cooldown_minutes: 0,
    active: true,
  },
  welcome: {
    name: "Welcome message",
    match: "contains",
    keywords: [],
    reply: {
      type: "buttons",
      text: "Hi {{first_name}}! 👋 Thanks for messaging us. How can we help?",
      buttons: ["Price list", "Talk to us"],
    },
    cooldown_minutes: 0,
    active: true,
  },
  away: {
    name: "Away message",
    match: "contains",
    keywords: [],
    reply: {
      type: "text",
      text: "Thanks for your message! We're closed right now and will reply as soon as we're back.",
    },
    cooldown_minutes: 240,
    active: true,
  },
  default: {
    name: "Default reply",
    match: "contains",
    keywords: [],
    reply: { type: "text", text: "Thanks for your message! Someone from our team will reply soon." },
    cooldown_minutes: 1440,
    active: true,
  },
};

export function RuleModal({
  rule,
  trigger,
  onClose,
  onSaved,
}: {
  rule: Rule | null;
  /** creating a new rule of this kind (when `rule` is null) */
  trigger: Trigger | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const kind = rule?.trigger ?? trigger ?? "keyword";
  const [form, setForm] = useState<RuleInput>(() =>
    rule
      ? {
          name: rule.name,
          trigger: rule.trigger,
          match: rule.match,
          keywords: rule.keywords,
          reply: rule.reply,
          cooldown_minutes: rule.cooldown_minutes,
          active: rule.active,
        }
      : { trigger: kind, ...BLANK[kind] }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RuleInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await automationApi.save(
        {
          ...form,
          reply: {
            ...form.reply,
            buttons: (form.reply.buttons ?? []).filter((b) => b.trim()),
            rows: (form.reply.rows ?? []).filter((r) => r.title.trim()),
          },
        },
        rule?.id
      );
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const preview = previewOf(form.reply);
  const open = rule !== null || trigger !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      size="xl"
      title={rule ? `Edit ${rule.name}` : `New ${TRIGGERS[kind].label.toLowerCase()}`}
      description={TRIGGERS[kind].hint}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!form.name.trim()} onClick={save}>
            {rule ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Input
            name="rule_name"
            label="Name"
            required
            placeholder="Price list"
            value={form.name}
            maxLength={120}
            error={errors.name}
            onChange={(e) => set({ name: e.target.value })}
            hint="Shown in the inbox next to the reply, e.g. “Auto-reply: Price list”."
          />

          {kind === "keyword" && (
            <div className="border-line bg-page space-y-3 rounded-lg border p-3">
              <TagInput
                id="rule-keywords"
                label="Keywords"
                value={form.keywords}
                onChange={(keywords) => set({ keywords })}
                placeholder="Type a keyword and press Enter"
              />
              {errors.keywords && <p className="text-danger text-xs">{errors.keywords}</p>}
              <div>
                <p className="text-fg mb-1.5 text-sm font-medium">Match</p>
                <Segmented<MatchType>
                  label="Match"
                  value={form.match}
                  onChange={(match) => set({ match })}
                  options={[
                    { value: "contains", label: "Contains the word" },
                    { value: "exact", label: "Is exactly" },
                    { value: "starts_with", label: "Starts with" },
                  ]}
                />
                <p className="text-fg-faint mt-1.5 text-xs">
                  {form.match === "contains"
                    ? "“price” matches “What is the price?” but not “pricey”."
                    : form.match === "exact"
                      ? "Only when the whole message is the keyword, e.g. “hi”."
                      : "“order” matches “order 1042 status”."}{" "}
                  Capital letters don&apos;t matter.
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-fg mb-2 text-sm font-semibold">Reply</p>
            <ReplyFields
              reply={form.reply}
              onChange={(reply) => set({ reply })}
              error={errors.reply ?? errors["reply.text"]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="rule-cooldown"
              label="Send to the same person"
              value={String(form.cooldown_minutes)}
              options={COOLDOWNS}
              onChange={(v) => set({ cooldown_minutes: Number(v) })}
            />
            <div className="flex items-end pb-2">
              <Switch checked={form.active} onChange={(active) => set({ active })} label="Turned on" />
            </div>
          </div>
        </div>

        <aside aria-label="Reply preview" className="lg:sticky lg:top-0">
          <p className="text-fg-subtle mb-2 text-xs font-medium">Preview</p>
          <ChatBackdrop className="flex min-h-48 justify-center py-6">
            <TemplateBubble
              template={preview.template}
              media={preview.media}
              values={SAMPLE_NAMES}
              highlight={false}
            />
          </ChatBackdrop>
        </aside>
      </div>
    </Modal>
  );
}
