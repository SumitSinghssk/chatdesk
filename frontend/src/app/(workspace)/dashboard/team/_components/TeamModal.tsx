"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, Input, Modal, MultiSelect, Textarea } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { teamApi, type Member, type Team } from "../../_lib/teamApi";

export function TeamModal({
  team,
  members,
  onClose,
  onSaved,
}: {
  team: Team | "new" | null;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const existing = team && team !== "new" ? team : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [memberIds, setMemberIds] = useState<string[]>((existing?.member_ids ?? []).map(String));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await teamApi.saveTeam(
        { name, description: description || null, member_ids: memberIds.map(Number) },
        existing?.id
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

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Delete the ${existing.name} team?`,
      message: "Its chats keep the person they're assigned to.",
      confirmLabel: "Delete team",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await teamApi.deleteTeam(existing.id);
      toast.success("Team deleted");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={!!team}
      onClose={onClose}
      size="md"
      title={existing ? `Edit ${existing.name}` : "New team"}
      footer={
        <>
          {existing && (
            <Button variant="ghost" leftIcon={Trash2} className="text-danger mr-auto" onClick={remove}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!name.trim()} onClick={save}>
            {existing ? "Save" : "Create team"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          name="team_name"
          label="Name"
          required
          placeholder="Sales"
          value={name}
          maxLength={60}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <Textarea
          name="team_description"
          label="Description"
          rows={2}
          placeholder="What this team handles"
          value={description}
          maxLength={255}
          onChange={(e) => setDescription(e.target.value)}
        />
        <MultiSelect
          id="team-members"
          label="Members"
          options={members
            .filter((m) => m.status === "active")
            .map((m) => ({ value: m.id, label: m.name || m.email || `#${m.id}` }))}
          value={memberIds}
          onChange={setMemberIds}
          placeholder="Choose people"
        />
      </div>
    </Modal>
  );
}
