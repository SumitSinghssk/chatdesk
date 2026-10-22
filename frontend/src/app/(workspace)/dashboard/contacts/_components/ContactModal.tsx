"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, Button, Input, Modal, Switch } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { formatDateTime } from "@/lib/utils";

import { CONTACTS_QK, contactsApi, type Contact } from "../../_lib/contactsApi";
import { TagInput } from "../../_components/TagInput";

type Row = { key: string; value: string };

function initialRows(contact: Contact | null): Row[] {
  const rows = Object.entries(contact?.attributes ?? {}).map(([key, value]) => ({ key, value }));
  return rows.length ? rows : [{ key: "", value: "" }];
}

/** Add / edit a contact. Keyed by contact id by the caller, so state resets per contact. */
export function ContactModal({
  open,
  contact,
  tagSuggestions,
  onClose,
  onSaved,
}: {
  open: boolean;
  contact: Contact | null;
  tagSuggestions: string[];
  onClose: () => void;
  onSaved: (c: Contact) => void;
}) {
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [tags, setTags] = useState<string[]>(contact?.tags ?? []);
  const [rows, setRows] = useState<Row[]>(() => initialRows(contact));
  const [optedOut, setOptedOut] = useState(contact?.opted_out ?? false);
  const [blocked, setBlocked] = useState(contact?.blocked ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const keys = useQuery({
    queryKey: CONTACTS_QK.ATTRIBUTES,
    queryFn: async () => (await contactsApi.attributes()).data,
    enabled: open,
    staleTime: 60_000,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const attributes = Object.fromEntries(
      rows.filter((r) => r.key.trim() && r.value.trim()).map((r) => [r.key.trim(), r.value.trim()])
    );
    const body = {
      phone,
      name: name.trim() || null,
      email: email.trim() || null,
      tags,
      attributes,
      opted_out: optedOut,
      blocked,
    };
    try {
      const res = contact ? await contactsApi.update(contact.id, body) : await contactsApi.create(body);
      toast.success(res.message ?? "Saved");
      onSaved(res.data);
    } catch (err) {
      if (err instanceof CustomerApiError && Object.keys(err.errors).length) setErrors(err.errors);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const locked = !!contact?.conversation;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      variant="drawer"
      title={contact ? "Edit contact" : "New contact"}
      description={
        contact
          ? undefined
          : "Add someone you can message on WhatsApp. You need their opt-in before sending marketing templates."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="contact-form" loading={busy}>
            {contact ? "Save changes" : "Add contact"}
          </Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="space-y-5" noValidate>
        {contact && (
          <div className="flex items-center gap-3">
            <Avatar name={contact.display_name} size={44} />
            <div className="min-w-0">
              <p className="text-fg truncate font-semibold">{contact.display_name}</p>
              <p className="text-fg-subtle truncate text-xs">
                Added {formatDateTime(contact.created_at)} · via {contact.source}
                {contact.profile_name ? ` · WhatsApp name: ${contact.profile_name}` : ""}
              </p>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="WhatsApp number"
            name="phone"
            required
            inputMode="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={locked}
            hint={
              locked
                ? "Can't change: this contact already has a chat."
                : "Without + code, your default country code is used."
            }
            error={errors.phone}
          />
          <Input
            label="Name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={150}
            error={errors.name}
          />
        </div>
        <Input
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TagInput
          label="Tags"
          id="contact-tags"
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
        />

        <fieldset>
          <legend className="text-fg-muted dark:text-fg mb-1.5 text-[13px] font-medium">Custom fields</legend>
          <p className="text-fg-subtle mb-2 text-xs">
            For example city, order count or plan. Use them to filter contacts and personalise templates.
          </p>
          <datalist id="attribute-keys">
            {(keys.data ?? []).map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  aria-label={`Field ${i + 1} name`}
                  name={`attr_key_${i}`}
                  list="attribute-keys"
                  placeholder="city"
                  value={row.key}
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                  wrapperClassName="w-2/5"
                  maxLength={40}
                />
                <Input
                  aria-label={`Field ${i + 1} value`}
                  name={`attr_value_${i}`}
                  placeholder="Delhi"
                  value={row.value}
                  onChange={(e) =>
                    setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                  }
                  wrapperClassName="flex-1"
                  maxLength={500}
                />
                <Button
                  iconOnly
                  variant="ghost"
                  leftIcon={Trash2}
                  aria-label={`Remove field ${i + 1}`}
                  onClick={() =>
                    setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ key: "", value: "" }])
                  }
                />
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Plus}
            className="mt-2"
            onClick={() => setRows([...rows, { key: "", value: "" }])}
          >
            Add field
          </Button>
        </fieldset>

        <div className="border-line space-y-3 rounded-lg border p-3">
          <Switch
            label="Opted out of marketing"
            hint="Templates won't be sent to this contact."
            checked={optedOut}
            onChange={setOptedOut}
          />
          <Switch
            label="Blocked"
            hint="Stops all replies from the inbox."
            checked={blocked}
            onChange={setBlocked}
          />
        </div>
      </form>
    </Modal>
  );
}
