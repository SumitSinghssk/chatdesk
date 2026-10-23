"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button, Input, Modal, RadioGroup, Select, Textarea } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { TagInput } from "../../../_components/TagInput";
import type { MatchType } from "../../../_lib/automationApi";
import {
  chatbotsApi,
  TRIGGER_LABELS,
  type BotMeta,
  type BotTrigger,
  type Chatbot,
} from "../../../_lib/chatbotsApi";

const TIMEOUTS = [5, 10, 15, 30, 60, 120, 240, 720, 1440];
const RESTARTS = [0, 60, 240, 720, 1440, 4320, 10080];

const minutes = (m: number) =>
  m === 0
    ? "No limit"
    : m < 60
      ? `${m} minutes`
      : m < 1440
        ? `${m / 60} hour${m === 60 ? "" : "s"}`
        : `${m / 1440} day${m === 1440 ? "" : "s"}`;

export function SettingsModal({
  bot,
  open,
  onClose,
  onSaved,
}: {
  bot: Chatbot;
  open: boolean;
  onClose: () => void;
  onSaved: (bot: Chatbot) => void;
}) {
  const [form, setForm] = useState<BotMeta>({
    name: bot.name,
    description: bot.description,
    trigger: bot.trigger,
    match: bot.match,
    keywords: bot.keywords,
    restart_minutes: bot.restart_minutes,
    settings: bot.settings,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<BotMeta>) => setForm((f) => ({ ...f, ...patch }));
  const setS = (patch: Partial<BotMeta["settings"]>) =>
    setForm((f) => ({ ...f, settings: { ...f.settings, ...patch } }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await chatbotsApi.update(bot.id, form);
      toast.success("Settings saved");
      onSaved(res.data);
      onClose();
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      size="md"
      title="Chatbot settings"
      description="What starts it, and how it behaves while it talks."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save settings
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>
        )}
        <Input
          name="bot_name"
          label="Name"
          maxLength={120}
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <Input
          name="bot_description"
          label="Description"
          placeholder="Optional, for your team"
          maxLength={300}
          value={form.description ?? ""}
          onChange={(e) => set({ description: e.target.value || null })}
        />
        <RadioGroup<BotTrigger>
          name="bot_trigger"
          label="Starts when"
          value={form.trigger}
          onChange={(trigger) =>
            set({
              trigger,
              restart_minutes: trigger === "any" && !form.restart_minutes ? 1440 : form.restart_minutes,
            })
          }
          options={(Object.keys(TRIGGER_LABELS) as BotTrigger[]).map((t) => ({
            value: t,
            label: TRIGGER_LABELS[t].label,
            description: TRIGGER_LABELS[t].hint,
          }))}
        />
        {form.trigger === "keyword" && (
          <div className="space-y-3">
            <TagInput
              id="bot-keywords"
              label="Keywords"
              value={form.keywords}
              onChange={(keywords) => set({ keywords })}
              placeholder="Type a keyword and press Enter"
            />
            <Select
              label="Match"
              value={form.match}
              onChange={(match) => set({ match: match as MatchType })}
              options={[
                { value: "exact", label: "The message is exactly the keyword" },
                { value: "contains", label: "The message contains the keyword" },
                { value: "starts_with", label: "The message starts with the keyword" },
              ]}
              hint="Tip: use a template button's text as a keyword to start the chatbot when it's tapped."
            />
          </div>
        )}
        {form.trigger !== "manual" && (
          <Select
            label="Start again for the same person"
            value={form.restart_minutes}
            onChange={(v) => set({ restart_minutes: Number(v) })}
            options={RESTARTS.map((m) => ({
              value: m,
              label: m === 0 ? "Every time" : `At most once every ${minutes(m)}`,
            }))}
          />
        )}

        <div className="border-line space-y-4 border-t pt-5">
          <p className="text-fg text-sm font-semibold">While it talks</p>
          <Select
            label="Give up when the customer goes quiet for"
            value={form.settings.timeout_minutes}
            onChange={(v) => setS({ timeout_minutes: Number(v) })}
            options={TIMEOUTS.map((m) => ({ value: m, label: minutes(m) }))}
          />
          <Textarea
            name="bot_timeout_text"
            label="Message when it gives up"
            rows={2}
            maxLength={1024}
            placeholder="Optional, e.g. Reply MENU whenever you're ready."
            value={form.settings.timeout_text ?? ""}
            onChange={(e) => setS({ timeout_text: e.target.value || null })}
          />
          <Textarea
            name="bot_invalid_text"
            label="When a reply doesn't match the buttons or list"
            rows={2}
            maxLength={1024}
            value={form.settings.invalid_text ?? ""}
            onChange={(e) => setS({ invalid_text: e.target.value || null })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Ask again up to"
              value={form.settings.max_retries}
              onChange={(v) => setS({ max_retries: Number(v) })}
              options={[0, 1, 2, 3, 4, 5].map((n) => ({
                value: n,
                label: n === 0 ? "Don't ask again" : `${n} time${n > 1 ? "s" : ""}`,
              }))}
            />
            <Select
              label="Then"
              value={form.settings.on_fail}
              onChange={(v) => setS({ on_fail: v as "handover" | "end" })}
              options={[
                { value: "handover", label: "Hand over to the team" },
                { value: "end", label: "End the chatbot" },
              ]}
            />
          </div>
          <TagInput
            id="bot-exit"
            label="Words that call a person"
            value={form.settings.exit_keywords}
            onChange={(exit_keywords) => setS({ exit_keywords })}
            placeholder="agent, human…"
          />
          <Textarea
            name="bot_handover_text"
            label="Message when handing over"
            rows={2}
            maxLength={1024}
            value={form.settings.handover_text ?? ""}
            onChange={(e) => setS({ handover_text: e.target.value || null })}
          />
          <p className="text-fg-faint text-xs">
            When someone from your team replies in the chat, the chatbot steps back by itself.
          </p>
        </div>
      </div>
    </Modal>
  );
}
