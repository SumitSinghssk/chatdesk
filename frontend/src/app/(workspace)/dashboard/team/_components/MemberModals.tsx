"use client";

import { useState } from "react";
import { Check, Copy, Link2, MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Modal, MultiSelect, RadioGroup } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { useDashboard } from "../../_components/DashboardContext";
import { teamApi, type Member, type Team } from "../../_lib/teamApi";

export const ROLE_OPTIONS = [
  {
    value: "agent" as const,
    label: "Agent",
    description: "Chats with customers in the inbox and manages contacts.",
  },
  {
    value: "admin" as const,
    label: "Admin",
    description: "Everything: templates, campaigns, WhatsApp setup and the team.",
  },
];

/** Which WhatsApp numbers someone works on. Only shown once the workspace has more than one. */
function NumberAccess({
  every,
  picked,
  error,
  onChange,
}: {
  every: boolean;
  picked: string[];
  error?: string;
  onChange: (every: boolean, picked: string[]) => void;
}) {
  const { numbers } = useDashboard();
  if (numbers.length < 2) return null;
  return (
    <div className="space-y-3">
      <RadioGroup
        label="WhatsApp numbers"
        columns={2}
        value={every ? "all" : "some"}
        onChange={(v) => onChange(v === "all", picked)}
        options={[
          { value: "all", label: "All numbers", description: "Including numbers added later." },
          { value: "some", label: "Only some", description: "They won't see the other numbers at all." },
        ]}
      />
      {!every && (
        <MultiSelect
          id="member-numbers"
          label="Numbers they work on"
          options={numbers.map((n) => ({ value: n.id, label: n.label }))}
          value={picked}
          onChange={(v) => onChange(false, v)}
          placeholder="Pick at least one"
          error={error}
        />
      )}
    </div>
  );
}

/** The invite link, ready to copy or send on WhatsApp. */
export function InviteLink({ member, workspace }: { member: Member; workspace: string }) {
  const [copied, setCopied] = useState(false);
  const url = member.invite_url ?? "";
  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => null);
    setCopied(true);
    toast.success("Invite link copied");
    setTimeout(() => setCopied(false), 2000);
  };
  const text = `Hi${member.name ? ` ${member.name}` : ""}, join ${workspace} on ChatDesk to handle our WhatsApp chats: ${url}`;
  return (
    <div className="border-primary/30 bg-primary-soft/40 space-y-3 rounded-xl border p-4">
      <p className="text-fg flex items-center gap-2 text-sm font-semibold">
        <Link2 className="text-primary h-4 w-4" /> Invite link for {member.email}
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          aria-label="Invite link"
          onFocus={(e) => e.target.select()}
          className="border-line bg-surface text-fg min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs"
        />
        <Button variant="secondary" leftIcon={copied ? Check : Copy} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
      >
        <MessageCircle className="h-4 w-4" /> Send it on WhatsApp
      </a>
      <p className="text-fg-subtle text-xs">
        They open it, choose a password and they&apos;re in. The link works once and expires in 7 days.
      </p>
    </div>
  );
}

export function InviteModal({
  open,
  teams,
  workspace,
  onClose,
  onInvited,
}: {
  open: boolean;
  teams: Team[];
  workspace: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [everyNumber, setEveryNumber] = useState(true);
  const [numberIds, setNumberIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [invited, setInvited] = useState<Member | null>(null);

  const reset = () => {
    setEmail("");
    setName("");
    setRole("agent");
    setTeamIds([]);
    setEveryNumber(true);
    setNumberIds([]);
    setErrors({});
    setInvited(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await teamApi.invite({
        email,
        name: name || null,
        role,
        team_ids: teamIds.map(Number),
        all_numbers: everyNumber,
        number_ids: everyNumber ? [] : numberIds.map(Number),
      });
      setInvited(res.data);
      onInvited();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={invited ? "Invite ready" : "Invite a team member"}
      description={invited ? undefined : "They get their own login and work in your workspace."}
      footer={
        invited ? (
          <>
            <Button variant="ghost" onClick={reset}>
              Invite another
            </Button>
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button leftIcon={UserPlus} loading={saving} disabled={!email.trim()} onClick={submit}>
              Create invite
            </Button>
          </>
        )
      }
    >
      {invited ? (
        <InviteLink member={invited} workspace={workspace} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="invite_email"
              type="email"
              label="Email"
              required
              autoFocus
              placeholder="ravi@yourbusiness.com"
              value={email}
              error={errors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              name="invite_name"
              label="Name"
              placeholder="Optional"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <RadioGroup label="Role" columns={2} value={role} onChange={setRole} options={ROLE_OPTIONS} />
          {teams.length > 0 && (
            <MultiSelect
              id="invite-teams"
              label="Teams"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
              value={teamIds}
              onChange={setTeamIds}
              placeholder="Optional"
            />
          )}
          <NumberAccess
            every={everyNumber}
            picked={numberIds}
            error={errors.number_ids}
            onChange={(every, picked) => {
              setEveryNumber(every);
              setNumberIds(picked);
            }}
          />
        </div>
      )}
    </Modal>
  );
}

export function EditMemberModal({
  member,
  teams,
  onClose,
  onSaved,
}: {
  member: Member | null;
  teams: Team[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<"admin" | "agent">(member?.role === "admin" ? "admin" : "agent");
  const [teamIds, setTeamIds] = useState<string[]>((member?.teams ?? []).map((t) => String(t.id)));
  const [everyNumber, setEveryNumber] = useState(member?.all_numbers ?? true);
  const [numberIds, setNumberIds] = useState<string[]>((member?.number_ids ?? []).map(String));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const owner = member?.role === "owner";

  const save = async () => {
    if (!member) return;
    setSaving(true);
    try {
      setErrors({});
      const res = await teamApi.updateMember(member.id, {
        role,
        team_ids: teamIds.map(Number),
        all_numbers: everyNumber,
        number_ids: everyNumber ? [] : numberIds.map(Number),
      });
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      size="md"
      title={`Edit ${member?.name || member?.email || "member"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RadioGroup
          label="Role"
          columns={2}
          value={role}
          onChange={setRole}
          options={ROLE_OPTIONS}
          disabled={member?.is_you}
          hint={member?.is_you ? "You can't change your own role." : undefined}
        />
        <MultiSelect
          id="member-teams"
          label="Teams"
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
          value={teamIds}
          onChange={setTeamIds}
          placeholder={teams.length ? "No team" : "Create teams in the Teams tab"}
        />
        {!owner && (
          <NumberAccess
            every={everyNumber}
            picked={numberIds}
            error={errors.number_ids}
            onChange={(every, picked) => {
              setEveryNumber(every);
              setNumberIds(picked);
            }}
          />
        )}
      </div>
    </Modal>
  );
}
