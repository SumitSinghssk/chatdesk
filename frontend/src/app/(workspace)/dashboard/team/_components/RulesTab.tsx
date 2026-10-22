"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Shuffle } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, RadioGroup, Select, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import { TEAM_QK, teamApi, type Team, type TeamSettings } from "../../_lib/teamApi";
import { Segmented } from "../../templates/_components/editor/parts";

function Form({ initial, teams }: { initial: TeamSettings; teams: Team[] }) {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<TeamSettings>(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TeamSettings>) => setRules((r) => ({ ...r, ...patch }));
  const on = rules.auto_assign === "round_robin";

  const save = async () => {
    setSaving(true);
    try {
      const res = await teamApi.saveSettings(rules);
      toast.success(res.message ?? "Saved");
      queryClient.setQueryData(TEAM_QK.SETTINGS, res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-5">
      <section className="space-y-4">
        <div>
          <h2 className="text-fg flex items-center gap-2 font-semibold">
            <Shuffle className="text-primary h-4 w-4" /> Auto-assign new chats
          </h2>
          <p className="text-fg-subtle text-sm">
            When a customer writes and the chat has nobody on it, give it to the next person in turn.
          </p>
        </div>
        <Segmented
          label="Auto-assign"
          value={rules.auto_assign}
          onChange={(auto_assign) => set({ auto_assign })}
          options={[
            { value: "off", label: "Off: chats wait in Unassigned" },
            { value: "round_robin", label: "Round-robin", icon: Shuffle },
          ]}
        />
        {on && (
          <div className="border-line bg-page grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <Select
              id="rules-team"
              label="Give chats to"
              value={rules.assign_team_id ?? ""}
              options={[
                { value: "", label: "Everyone in the workspace" },
                ...teams.map((t) => ({ value: t.id, label: `The ${t.name} team` })),
              ]}
              onChange={(v) => set({ assign_team_id: v ? Number(v) : null })}
            />
            <Input
              name="max_open"
              type="number"
              min={1}
              label="Max open chats per person"
              placeholder="No limit"
              value={rules.max_open ?? ""}
              onChange={(e) => set({ max_open: e.target.value ? Number(e.target.value) : null })}
              hint="People at the limit are skipped until they resolve some."
            />
            <div className="sm:col-span-2">
              <Switch
                checked={rules.only_available}
                onChange={(only_available) => set({ only_available })}
                label="Skip people who are Away"
                hint="Everyone switches Available / Away from their menu at the top right."
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-fg flex items-center gap-2 font-semibold">
            <Eye className="text-primary h-4 w-4" /> What agents can see
          </h2>
          <p className="text-fg-subtle text-sm">Owners and admins always see every chat.</p>
        </div>
        <RadioGroup
          columns={3}
          value={rules.agent_visibility}
          onChange={(agent_visibility) => set({ agent_visibility })}
          options={[
            { value: "all", label: "All chats", description: "Agents see and answer every chat." },
            {
              value: "assigned",
              label: "Theirs + unassigned",
              description: "Their chats, plus chats nobody has yet (in their teams).",
            },
            { value: "own", label: "Only theirs", description: "Just the chats assigned to them." },
          ]}
        />
      </section>

      <div className="flex justify-end">
        <Button loading={saving} onClick={save}>
          Save rules
        </Button>
      </div>
    </div>
  );
}

export function RulesTab({ teams }: { teams: Team[] }) {
  const { data } = useQuery({
    queryKey: TEAM_QK.SETTINGS,
    queryFn: async () => (await teamApi.settings()).data,
  });
  if (!data)
    return (
      <div className="p-5">
        <Skeleton className="h-60" />
      </div>
    );
  return <Form initial={data} teams={teams} />;
}
