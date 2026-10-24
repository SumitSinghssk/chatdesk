"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Cpu,
  Hand,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Pin,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  Input,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { TagInput } from "../../../_components/TagInput";
import {
  AI_QK,
  aiAgentApi,
  usd,
  type Agent,
  type AgentInput,
  type Behaviour as B,
} from "../../../_lib/aiAgentApi";
import { useConnections } from "../AiAgents";
import { useProviders } from "../ConnectionModal";

const LANGUAGES = [
  "auto",
  "English",
  "Hindi",
  "Hinglish",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Bengali",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Urdu",
  "Arabic",
  "Spanish",
  "French",
  "Portuguese",
  "Indonesian",
];

const IDEAS = [
  "Always share our WhatsApp number when someone wants to order.",
  "Never offer discounts. If asked, say the team will check.",
  "Ask for the customer's city before telling delivery charges.",
  "End with a short question that helps them take the next step.",
];

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={description} />
      <div className="space-y-4 p-5">{children}</div>
    </Card>
  );
}

function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  options: { value: T; label: string; text?: string }[];
}) {
  return (
    <div>
      <p className="text-fg mb-1.5 text-sm font-medium">{label}</p>
      <div
        className={cn("grid gap-2", options.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-3")}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition",
              value === o.value
                ? "border-primary bg-primary-soft ring-primary/30 ring-2"
                : "border-line hover:bg-hover"
            )}
          >
            <span className="text-fg block text-sm font-medium">{o.label}</span>
            {o.text && <span className="text-fg-subtle block text-xs">{o.text}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Behaviour({ agent }: { agent: Agent }) {
  const qc = useQueryClient();
  const connections = useConnections().data ?? [];
  const providers = useProviders().data ?? [];
  const initial: AgentInput = {
    name: agent.name,
    connection_id: agent.connection?.id ?? null,
    model: agent.model,
    behaviour: agent.behaviour,
    limits: agent.limits,
  };
  const [form, setForm] = useState<AgentInput>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [fact, setFact] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== saved;
  const b = form.behaviour;
  const setB = (patch: Partial<B>) => setForm((f) => ({ ...f, behaviour: { ...f.behaviour, ...patch } }));
  const setH = (patch: Partial<B["handover"]>) => setB({ handover: { ...b.handover, ...patch } });
  const setL = (patch: Partial<AgentInput["limits"]>) =>
    setForm((f) => ({ ...f, limits: { ...f.limits, ...patch } }));
  const connection = connections.find((c) => c.id === form.connection_id);
  const prices = providers.find((p) => p.key === connection?.provider)?.prices ?? {};
  const models = (connection?.models ?? []).map((m) => ({
    value: m,
    label: prices[m] ? `${m} · $${prices[m][0]} / $${prices[m][1]} per 1M tokens` : m,
  }));
  if (form.model && !models.some((m) => m.value === form.model))
    models.unshift({ value: form.model, label: form.model });

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await aiAgentApi.update(agent.id, form);
      qc.setQueryData(AI_QK.AGENT(agent.id), res.data);
      void qc.invalidateQueries({ queryKey: AI_QK.AGENTS });
      setSaved(JSON.stringify(form));
      toast.success("Saved. The next reply uses it.");
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const addFact = () => {
    const text = fact.trim();
    if (!text) return;
    setB({ facts: [...b.facts, { text }] });
    setFact("");
  };

  return (
    <div className="space-y-4">
      <Section
        icon={Cpu}
        title="AI model"
        description="Which AI writes the replies. You pay your provider directly for what it uses."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="AI provider"
            value={form.connection_id}
            onChange={(v) => setForm((f) => ({ ...f, connection_id: Number(v), model: null }))}
            options={connections.map((c) => ({ value: c.id, label: `${c.label} (${c.provider_label})` }))}
            placeholder="Connect a provider first"
            error={errors.connection_id}
          />
          <Select
            label="Model"
            value={form.model ?? ""}
            onChange={(v) => setForm((f) => ({ ...f, model: v || null }))}
            options={models}
            searchable
            placeholder="Choose a model"
            error={errors.model}
          />
        </div>
        <Choice
          label="Answer quality"
          value={b.quality}
          onChange={(quality) => setB({ quality })}
          options={[
            { value: "fast", label: "Fast", text: "Quick replies, fewest tokens. Right for most chats." },
            { value: "balanced", label: "Balanced", text: "Thinks a bit more on tricky questions." },
            { value: "best", label: "Best", text: "Most careful answers; slower and costs more." },
          ]}
        />
      </Section>

      <Section icon={UserRound} title="Who it is">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Agent name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
            required
          />
          <Input
            label="Business name"
            value={b.business_name}
            onChange={(e) => setB({ business_name: e.target.value })}
          />
        </div>
        <Input
          label="Its job"
          value={b.role}
          onChange={(e) => setB({ role: e.target.value })}
          hint='e.g. "customer support assistant", "sales executive", "booking assistant"'
        />
        <Textarea
          label="About the business"
          rows={3}
          value={b.about}
          onChange={(e) => setB({ about: e.target.value })}
          placeholder="We are a family sweet shop in Dehradun since 1975, known for kaju katli and fresh gulab jamun. We deliver across the city."
          hint="Two or three lines are enough. Details belong in Knowledge."
        />
      </Section>

      <Section icon={MessageSquareText} title="How it talks">
        <Choice
          label="Tone"
          value={b.tone}
          onChange={(tone) => setB({ tone })}
          options={[
            { value: "friendly", label: "Friendly" },
            { value: "professional", label: "Professional" },
            { value: "casual", label: "Casual" },
            { value: "formal", label: "Formal" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Language"
            value={b.language}
            onChange={(language) => setB({ language })}
            options={LANGUAGES.map((l) => ({
              value: l,
              label: l === "auto" ? "The customer's language (automatic)" : l,
            }))}
            searchable
          />
          <Select
            label="Reply length"
            value={b.length}
            onChange={(v) => setB({ length: v as B["length"] })}
            options={[
              { value: "short", label: "Short (1–3 sentences)" },
              { value: "medium", label: "Medium (a short paragraph)" },
              { value: "detailed", label: "Detailed (complete answers)" },
            ]}
          />
        </div>
        <Switch checked={b.emoji} onChange={(emoji) => setB({ emoji })} label="Use emojis now and then" />
      </Section>

      <Section
        icon={Pin}
        title="Important things"
        description="Always true and always remembered, even over what documents say. Perfect for offers, holidays and must-know rules."
      >
        {b.facts.length > 0 && (
          <ul className="space-y-2" aria-label="Important things">
            {b.facts.map((f, i) => (
              <li key={i} className="border-line flex items-start gap-2 rounded-lg border px-3 py-2">
                <Pin className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <textarea
                  aria-label={`Important thing ${i + 1}`}
                  value={f.text}
                  rows={1}
                  onChange={(e) =>
                    setB({ facts: b.facts.map((x, j) => (j === i ? { text: e.target.value } : x)) })
                  }
                  className="text-fg field-sizing-content min-w-0 flex-1 resize-none bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  aria-label={`Remove important thing ${i + 1}`}
                  onClick={() => setB({ facts: b.facts.filter((_, j) => j !== i) })}
                  className="text-fg-faint hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addFact();
          }}
        >
          <Input
            aria-label="New important thing"
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            placeholder="e.g. Diwali offer: 10% off on all gift boxes till 5 November"
            wrapperClassName="flex-1"
          />
          <Button type="submit" variant="secondary" leftIcon={Plus} disabled={!fact.trim()}>
            Add
          </Button>
        </form>
      </Section>

      <Section icon={ListChecks} title="Instructions" description="Your own rules, in plain words.">
        <Textarea
          rows={6}
          aria-label="Instructions"
          value={b.instructions}
          onChange={(e) => setB({ instructions: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5">
          <span className="text-fg-subtle flex items-center gap-1 text-xs">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Ideas:
          </span>
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setB({ instructions: `${b.instructions.trim()}\n${idea}`.trim() })}
              className="border-line text-fg-subtle hover:bg-hover hover:text-fg rounded-full border px-2.5 py-1 text-xs"
            >
              + {idea}
            </button>
          ))}
        </div>
      </Section>

      <Section icon={ShieldCheck} title="What it answers">
        <Choice
          label="Stick to"
          value={b.scope}
          onChange={(scope) => setB({ scope })}
          options={[
            {
              value: "strict",
              label: "Only my knowledge",
              text: "Never guesses. Politely declines off-topic questions.",
            },
            {
              value: "flexible",
              label: "My knowledge first",
              text: "May also answer related general questions.",
            },
          ]}
        />
        <Input
          label="When it doesn't know"
          value={b.unknown_reply}
          onChange={(e) => setB({ unknown_reply: e.target.value })}
          hint="Used when it can't hand over to your team."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="How it reads the knowledge"
            value={b.knowledge_mode}
            onChange={(v) => setB({ knowledge_mode: v as B["knowledge_mode"] })}
            options={[
              { value: "auto", label: "Automatic (recommended)" },
              { value: "full", label: "Send everything (most accurate)" },
              { value: "search", label: "Only matching parts (cheapest)" },
            ]}
            hint={`Now: ${agent.knowledge.mode === "full" ? "everything, cached" : "matching parts"}`}
          />
          <div className="sm:pt-6">
            <Switch
              checked={b.cache_answers}
              onChange={(cache_answers) => setB({ cache_answers })}
              label="Reuse answers to repeated questions"
              hint="No AI cost when someone asks exactly what was asked before."
            />
          </div>
        </div>
      </Section>

      <Section
        icon={Hand}
        title="Handing over to your team"
        description="It passes the chat to a person, who sees it in the inbox, assigned and marked."
      >
        <Switch
          checked={b.handover.enabled}
          onChange={(enabled) => setH({ enabled })}
          label="Hand over when needed"
        />
        {b.handover.enabled && (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Checkbox
                checked={b.handover.when_unsure}
                onChange={(when_unsure) => setH({ when_unsure })}
                label="It doesn't know the answer"
              />
              <Checkbox
                checked={b.handover.when_asked}
                onChange={(when_asked) => setH({ when_asked })}
                label="The customer asks for a person"
              />
              <Checkbox
                checked={b.handover.when_upset}
                onChange={(when_upset) => setH({ when_upset })}
                label="The customer is upset"
              />
            </div>
            <TagInput
              label="Words that mean “a person please”"
              value={b.handover.keywords}
              onChange={(keywords) => setH({ keywords })}
              placeholder="Add a word and press Enter"
              id="handover-keywords"
            />
            <Input
              label="Message when handing over"
              value={b.handover.message}
              onChange={(e) => setH({ message: e.target.value })}
              hint="It writes this in the customer's language."
            />
            <RadioGroup
              label="Who gets the chat"
              value={b.handover.assign}
              onChange={(assign) => setH({ assign })}
              columns={2}
              options={[
                {
                  value: "auto",
                  label: "Your assignment rules",
                  description: "Round-robin to whoever is available",
                },
                {
                  value: "nobody",
                  label: "Leave it unassigned",
                  description: "Anyone in the team can pick it",
                },
              ]}
            />
          </>
        )}
      </Section>

      <Section icon={Brain} title="Memory and limits">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Recent messages read word for word"
            type="number"
            min={2}
            max={40}
            value={form.limits.memory_messages}
            onChange={(e) => setL({ memory_messages: Number(e.target.value) })}
            hint="Older ones are kept as a short summary, so nothing is forgotten."
          />
          <Input
            label="Longest reply (tokens)"
            type="number"
            min={100}
            max={4000}
            value={form.limits.reply_tokens}
            onChange={(e) => setL({ reply_tokens: Number(e.target.value) })}
          />
          <Input
            label="Monthly budget (USD)"
            type="number"
            min={0}
            step="0.5"
            value={form.limits.monthly_budget}
            onChange={(e) => setL({ monthly_budget: Number(e.target.value) })}
            hint={`0 = no limit · used this month: ${usd(agent.month_cost)}`}
          />
        </div>
      </Section>

      {dirty && (
        <div className="border-line bg-surface/95 sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur">
          <span className="text-fg-subtle mr-auto text-sm">You have unsaved changes</span>
          <Button variant="secondary" onClick={() => setForm(JSON.parse(saved))} disabled={saving}>
            Discard
          </Button>
          <Button leftIcon={Save} onClick={save} loading={saving}>
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
