"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button, Input, Modal, Select, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { AI_ASSIST_QK, aiAssistApi, type AssistSettings } from "../../_lib/aiAssistApi";
import { AI_QK, aiAgentApi } from "../../_lib/aiAgentApi";
import { modelOptions, useConnections } from "./AiAgents";

const ACTION_LABELS = {
  suggest: "Suggested replies",
  summarize: "Summaries",
  translate: "Translations",
  rewrite: "Rewrites",
};

function usd(n: number) {
  return n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`;
}

function Form({ settings, onClose }: { settings: AssistSettings; onClose: () => void }) {
  const qc = useQueryClient();
  const connections = useConnections().data ?? [];
  const agents = useQuery({ queryKey: AI_QK.AGENTS, queryFn: () => aiAgentApi.agents().then((r) => r.data) });
  const [enabled, setEnabled] = useState(settings.enabled);
  const [connectionId, setConnectionId] = useState<number | null>(
    settings.connection_id ?? connections[0]?.id ?? null
  );
  const [model, setModel] = useState(settings.model ?? "");
  const [agentId, setAgentId] = useState<number | null>(settings.agent_id);
  const [budget, setBudget] = useState(settings.monthly_budget ? String(settings.monthly_budget) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const connection = connections.find((c) => c.id === connectionId);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await aiAssistApi.saveSettings({
        enabled,
        connection_id: connectionId,
        model: model || null,
        agent_id: agentId,
        monthly_budget: budget.trim() ? Number(budget) : null,
      });
      toast.success(res.message ?? "Saved");
      qc.setQueryData(AI_ASSIST_QK.SETTINGS, res.data);
      void qc.invalidateQueries({ queryKey: AI_ASSIST_QK.STATUS });
      onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const used = settings.usage.by_action;
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Team assist"
      description="AI help for your team in the inbox: suggest a reply, summarize a chat, translate and rewrite. It uses your own AI connection; nothing is sent to customers without a person pressing Send."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Switch
          label="Turn on AI assist in the inbox"
          hint="Everyone who can reply in the inbox gets the ✨ button in the reply box."
          checked={enabled}
          onChange={setEnabled}
        />
        {settings.problem && enabled && (
          <p className="bg-warning-soft text-warning rounded-lg p-3 text-sm">{settings.problem}</p>
        )}
        {connections.length === 0 ? (
          <p className="text-fg-subtle text-sm">
            Add an AI connection first (AI connections button on this page).
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="AI connection"
              value={connectionId ?? ""}
              error={errors.connection_id}
              options={connections.map((c) => ({ value: c.id, label: `${c.label} (${c.provider_label})` }))}
              onChange={(v) => {
                setConnectionId(v ? Number(v) : null);
                setModel("");
              }}
            />
            <Select
              label="Model"
              value={model}
              searchable
              hint="A small, fast model is usually enough here."
              options={[{ value: "", label: "Pick a model" }, ...modelOptions(connection, model)]}
              onChange={setModel}
            />
            <Select
              label="Suggest replies as"
              value={agentId ?? ""}
              hint="Uses that agent's instructions, facts and knowledge for suggested replies."
              error={errors.agent_id}
              options={[
                { value: "", label: "No agent: general replies" },
                ...(agents.data ?? []).map((a) => ({ value: a.id, label: a.name })),
              ]}
              onChange={(v) => setAgentId(v ? Number(v) : null)}
            />
            <Input
              label="Monthly budget (USD)"
              inputMode="decimal"
              placeholder="No limit"
              value={budget}
              error={errors.monthly_budget}
              hint="AI assist stops for the month once it has spent this."
              onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
        )}
        <div className="border-line rounded-lg border p-3">
          <p className="text-fg text-sm font-semibold">
            This month: {usd(settings.usage.month_cost)}
            {settings.monthly_budget ? ` of ${usd(settings.monthly_budget)}` : ""}
          </p>
          <p className="text-fg-subtle mt-1 text-xs">
            {Object.keys(used).length
              ? Object.entries(used)
                  .map(([k, v]) => `${ACTION_LABELS[k as keyof typeof ACTION_LABELS]}: ${v?.uses ?? 0}`)
                  .join(" · ")
              : "Not used yet this month."}{" "}
            Costs are estimates; your AI provider bills you.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export function AssistSettingsModal({ onClose }: { onClose: () => void }) {
  const { data } = useQuery({
    queryKey: AI_ASSIST_QK.SETTINGS,
    queryFn: async () => (await aiAssistApi.settings()).data,
  });
  if (!data)
    return (
      <Modal open onClose={onClose} size="md" title="Team assist">
        <Skeleton className="h-48" />
      </Modal>
    );
  return <Form settings={data} onClose={onClose} />;
}
