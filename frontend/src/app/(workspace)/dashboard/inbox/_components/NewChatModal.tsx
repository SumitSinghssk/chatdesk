"use client";

import { useState, type FormEvent } from "react";

import { Button, Input, Modal } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { inboxApi, type Conversation } from "../../_lib/inboxApi";

/** Opens a chat with any WhatsApp number. The first message must be a template. */
export function NewChatModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (c: Conversation) => void;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await inboxApi.start({ phone, name: name.trim() || undefined });
      setPhone("");
      setName("");
      onStarted(res.data);
    } catch (err) {
      setError(err instanceof CustomerApiError && err.errors.phone ? err.errors.phone : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="New chat"
      description="Start a conversation with any WhatsApp number. WhatsApp requires the first message to be an approved template."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-chat-form" loading={busy} disabled={!phone.trim()}>
            Continue
          </Button>
        </>
      }
    >
      <form id="new-chat-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="WhatsApp number"
          name="phone"
          required
          autoFocus
          inputMode="tel"
          placeholder="91 98765 43210"
          hint="Include the country code. Spaces and + are fine."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={error || undefined}
        />
        <Input
          label="Name (optional)"
          name="contact_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
        />
      </form>
    </Modal>
  );
}
