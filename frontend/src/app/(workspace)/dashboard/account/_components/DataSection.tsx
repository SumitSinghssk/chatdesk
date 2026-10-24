"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileArchive, LogOut, Trash2 } from "lucide-react";

import { Button, Card, Input, Modal } from "@/app/admin/_components/ui/index";
import { notifyMemberChange } from "@/app/(customer)/_components/AccountLink";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { CardHeader } from "../../_components/CardHeader";
import { useDashboard } from "../../_components/DashboardContext";
import { accountApi } from "../../_lib/accountApi";

function DeleteModal({ onClose }: { onClose: () => void }) {
  const { me } = useDashboard();
  const router = useRouter();
  const qc = useQueryClient();
  const owner = me.role === "owner";
  const word = owner ? "DELETE" : "LEAVE";
  const [confirm, setConfirm] = useState("");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const needsSecret = me.has_password || me.two_factor_enabled;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await accountApi.deleteAccount({
        confirm,
        ...(me.has_password ? { password: secret } : me.two_factor_enabled ? { code: secret } : {}),
      });
      qc.clear();
      notifyMemberChange();
      router.replace(CUSTOMER_ROUTES.LOGIN());
    } catch (err) {
      if (err instanceof CustomerApiError) {
        setErrors(Object.keys(err.errors).length ? err.errors : { confirm: err.message });
      } else setErrors({ confirm: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="modal"
      size="sm"
      title={owner ? "Delete your account?" : "Leave this workspace?"}
      description={
        owner
          ? "Your workspace, your team's access, contacts, chats, campaigns, chatbots and AI agents are removed and your WhatsApp number is disconnected. Download your data first if you need it."
          : `You lose access to ${me.workspace?.name ?? "this workspace"}. Your chats are left for the team.`
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={`Type ${word} to confirm`}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          autoComplete="off"
          autoFocus
        />
        {needsSecret && (
          <Input
            label={me.has_password ? "Your password" : "A code from your authenticator app"}
            type={me.has_password ? "password" : "text"}
            autoComplete={me.has_password ? "current-password" : "one-time-code"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            error={errors.password || errors.code}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={busy}
            leftIcon={owner ? Trash2 : LogOut}
            disabled={confirm.trim().toUpperCase() !== word || (needsSecret && !secret)}
          >
            {owner ? "Delete account" : "Leave workspace"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DataSection() {
  const { me } = useDashboard();
  const [deleting, setDeleting] = useState(false);
  const owner = me.role === "owner";
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Download your data"
          icon={FileArchive}
          description="A ZIP of JSON files you can open or move elsewhere."
        />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <p className="text-fg-muted min-w-0 flex-1 text-sm">
            {owner
              ? "Everything in your workspace: team, contacts, chats and messages, templates, campaigns, automatic replies, chatbots, AI agents and your login history. Passwords and API keys are never included."
              : "Your account details, devices, login history and notifications."}
          </p>
          <Button variant="secondary" leftIcon={Download} href={accountApi.exportUrl()}>
            Download ZIP
          </Button>
        </div>
      </Card>
      <Card className="border-danger/40">
        <CardHeader
          title={owner ? "Delete account" : "Leave workspace"}
          icon={AlertTriangle}
          description={
            owner
              ? "Permanently remove your account and workspace."
              : "Stop being a member of this workspace."
          }
        />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <p className="text-fg-muted min-w-0 flex-1 text-sm">
            {owner
              ? "Everyone in your team loses access at once. This can't be undone from here."
              : "The owner or an admin can invite you again later."}
          </p>
          <Button
            variant="danger-outline"
            leftIcon={owner ? Trash2 : LogOut}
            onClick={() => setDeleting(true)}
          >
            {owner ? "Delete account" : "Leave workspace"}
          </Button>
        </div>
      </Card>
      {deleting && <DeleteModal onClose={() => setDeleting(false)} />}
    </div>
  );
}
