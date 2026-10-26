"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, StickyNote, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Avatar, Badge, Button, Input, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { INBOX_QK, inboxApi, type Conversation } from "../../_lib/inboxApi";
import { InfoHint } from "../../_components/CardHeader";
import { ContactOrders } from "./ContactOrders";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-line border-b px-4 py-3.5">
      <h3 className="text-fg-faint mb-2 flex items-center gap-1 text-[10.5px] font-semibold tracking-wide uppercase">
        {title}
        {hint && <InfoHint text={hint} />}
      </h3>
      {children}
    </section>
  );
}

export function ContactPanel({
  conversation,
  onChanged,
  onClose,
}: {
  conversation: Conversation;
  onChanged: (c: Conversation) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const contact = conversation.contact;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name ?? "");
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const notes = useQuery({
    queryKey: INBOX_QK.NOTES(conversation.id),
    queryFn: async () => (await inboxApi.notes(conversation.id)).data,
  });
  const allTags = useQuery({
    queryKey: INBOX_QK.TAGS,
    queryFn: async () => (await inboxApi.tags()).data,
    staleTime: 60_000,
  });

  const update = async (body: Parameters<typeof inboxApi.updateContact>[1], success?: string) => {
    setSaving(true);
    try {
      const res = await inboxApi.updateContact(conversation.id, body);
      onChanged(res.data);
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.TAGS });
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (await update({ name: name.trim() || null }, "Name saved")) setEditing(false);
  };

  const addTag = async (value: string) => {
    const clean = value.trim();
    setTag("");
    if (!clean || contact.tags.includes(clean)) return;
    await update({ tags: [...contact.tags, clean] });
  };

  const toggleBlock = async (blocked: boolean) => {
    if (blocked) {
      const ok = await confirm({
        title: `Block ${contact.display_name}?`,
        message: "You won't be able to send them messages from the inbox until you unblock them.",
        confirmLabel: "Block",
        variant: "danger",
      });
      if (!ok) return;
    }
    await update({ blocked }, blocked ? "Contact blocked" : "Contact unblocked");
  };

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await inboxApi.addNote(conversation.id, note.trim());
      setNote("");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.NOTES(conversation.id) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const removeNote = async (id: number) => {
    try {
      await inboxApi.deleteNote(conversation.id, id);
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.NOTES(conversation.id) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const suggestions = (allTags.data ?? []).filter((t) => !contact.tags.includes(t)).slice(0, 6);

  return (
    <aside aria-label="Contact details" className="bg-surface flex h-full min-h-0 flex-col">
      <div className="border-line flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-fg flex-1 text-sm font-semibold">Contact</h2>
        <Button
          iconOnly
          variant="ghost"
          size="sm"
          leftIcon={X}
          aria-label="Close contact panel"
          onClick={onClose}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="border-line flex flex-col items-center border-b px-4 py-5 text-center">
          <Avatar name={contact.display_name} size={64} />
          {editing ? (
            <form onSubmit={saveName} className="mt-3 w-full space-y-2">
              <Input
                aria-label="Contact name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
              />
              <div className="flex justify-center gap-2">
                <Button size="sm" type="submit" loading={saving}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setName(contact.name ?? contact.profile_name ?? "");
                setEditing(true);
              }}
              className="group text-fg mt-3 flex items-center gap-1.5 text-base font-semibold"
            >
              {contact.display_name}
              <Pencil
                className="text-fg-faint h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100"
                aria-label="Edit name"
              />
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(contact.phone).catch(() => null);
              toast.success("Number copied");
            }}
            className="text-fg-subtle hover:text-fg mt-0.5 flex items-center gap-1 text-sm"
          >
            {contact.phone} <Copy className="h-3 w-3" />
          </button>
          {contact.profile_name && contact.profile_name !== contact.display_name && (
            <p className="text-fg-faint mt-1 text-xs">WhatsApp name: {contact.profile_name}</p>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {contact.opted_out && <Badge tone="warning">Opted out</Badge>}
            {contact.blocked && <Badge tone="danger">Blocked</Badge>}
          </div>
        </div>

        <Section
          title="Tags"
          hint="Group contacts, e.g. VIP, Lead, Wholesale. Campaigns will be able to target tags."
        >
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map((t) => (
              <span
                key={t}
                className="bg-primary-soft text-primary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => update({ tags: contact.tags.filter((x) => x !== t) })}
                  className="hover:bg-primary/15 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {!contact.tags.length && <span className="text-fg-faint text-xs">No tags yet</span>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addTag(tag);
            }}
            className="mt-2"
          >
            <Input
              leftIcon={Tag}
              placeholder="Add a tag and press Enter"
              aria-label="Add a tag"
              value={tag}
              maxLength={40}
              onChange={(e) => setTag(e.target.value)}
            />
          </form>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestions.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="border-line text-fg-subtle hover:border-primary hover:text-primary rounded-full border px-2 py-0.5 text-[11px]"
                >
                  + {t}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Preferences">
          <div className="space-y-3">
            <Switch
              label="Opted out of marketing"
              hint="Templates won't be sent to this contact."
              checked={contact.opted_out}
              disabled={saving}
              onChange={(v) => update({ opted_out: v }, v ? "Marked as opted out" : "Opt-out removed")}
            />
            <Switch
              label="Blocked"
              hint="Stops all replies from this inbox."
              checked={contact.blocked}
              disabled={saving}
              onChange={toggleBlock}
            />
          </div>
        </Section>

        <Section title="Orders">
          <ContactOrders contactId={contact.id} />
        </Section>

        <Section title="Conversation">
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Status</dt>
              <dd className="text-fg font-medium capitalize">{conversation.status}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">First contact</dt>
              <dd className="text-fg">{formatDateTime(contact.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Customer last wrote</dt>
              <dd className="text-fg">
                {conversation.last_inbound_at ? timeAgo(conversation.last_inbound_at) : "Never"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Reply window</dt>
              <dd className={conversation.window_open ? "text-success font-medium" : "text-fg"}>
                {conversation.window_open ? "Open" : "Closed"}
              </dd>
            </div>
          </dl>
        </Section>

        <Section title="Internal notes" hint="Only your team sees notes. They're never sent to the customer.">
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Add a note for your team"
              aria-label="New note"
              className="border-line-strong bg-page text-fg placeholder:text-fg-faint focus:border-primary focus:ring-primary/15 w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-3 focus:outline-none"
            />
            <Button size="sm" type="submit" leftIcon={StickyNote} disabled={!note.trim()}>
              Add note
            </Button>
          </form>
          <ul className="mt-3 space-y-2">
            {notes.isLoading && <Skeleton className="h-12" />}
            {notes.data?.map((n) => (
              <li
                key={n.id}
                className="group/note rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-500/20 dark:bg-amber-500/10"
              >
                <p className="text-fg whitespace-pre-wrap">{n.body}</p>
                <p className="text-fg-subtle mt-1 flex items-center gap-1">
                  <span className="flex-1">
                    {n.author ?? "You"} · {timeAgo(n.created_at)}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() => removeNote(n.id)}
                    className="text-fg-faint hover:text-danger opacity-0 transition group-hover/note:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </aside>
  );
}
