"use client";

import { useState, type ReactNode } from "react";

import { Button, Input, Modal } from "@/app/admin/_components/ui/index";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";

export function PasswordPromptModal({
  open,
  title,
  description,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Enter your current password");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(password);
    } catch (err) {
      setError(apiFieldErrors(err).password ?? apiErrorMessage(err, "Something went wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="password-prompt" variant={danger ? "danger" : "primary"} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="password-prompt" onSubmit={submit} className="space-y-4" noValidate>
        {description && <div className="text-fg-muted text-sm">{description}</div>}
        <Input
          id="prompt-password"
          type="password"
          label="Current password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          error={error}
          onChange={(e) => setPassword(e.target.value)}
        />
      </form>
    </Modal>
  );
}
