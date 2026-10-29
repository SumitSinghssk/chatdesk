"use client";

import { useState } from "react";
import { Bot, CircleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Modal } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import type { ChatbotDraft } from "./chatbotFlow";

/** Before a drawn flow becomes a chatbot: what it turns into, and its name. It's made as a draft (off). */
export function ChatbotDialog({
  draft,
  error,
  name: startName,
  onMake,
  onClose,
}: {
  draft: ChatbotDraft | null;
  /** why this flow can't become a chatbot */
  error: string | null;
  name: string;
  onMake: (name: string, draft: ChatbotDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(startName.slice(0, 120));
  const [busy, setBusy] = useState(false);
  const c = draft?.counts;
  const parts = c
    ? [
        [c.messages, "message", "messages"],
        [c.choices, "choice with buttons", "choices with buttons"],
        [c.questions, "question", "questions"],
        [c.handovers, "hand-over to the team", "hand-overs to the team"],
        [c.ends, "end", "ends"],
      ].filter(([n]) => (n as number) > 0)
    : [];
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Turn into a chatbot"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {draft ? "Cancel" : "Close"}
          </Button>
          {draft && (
            <Button
              leftIcon={Bot}
              loading={busy}
              disabled={!name.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await onMake(name.trim(), draft);
                } catch (err) {
                  toast.error(errorMessage(err));
                  setBusy(false);
                }
              }}
            >
              Make the chatbot
            </Button>
          )}
        </div>
      }
    >
      {draft ? (
        <div className="space-y-4">
          <p className="text-fg-muted text-sm">
            The steps on this page become chatbot blocks, in order from the start:
          </p>
          <ul className="text-fg list-disc space-y-0.5 pl-5 text-sm">
            {parts.map(([n, one, many]) => (
              <li key={one as string}>
                <b>{n as number}</b> {(n as number) === 1 ? one : many}
              </li>
            ))}
          </ul>
          <p className="text-fg-subtle text-xs">
            Shapes with two or more lines going out ask the customer to choose (the lines&apos; labels become
            the buttons). Input / output shapes ask a question. People, and steps that mention the team, hand
            the chat over.
            {draft.skipped > 0 &&
              ` ${draft.skipped} shape${draft.skipped === 1 ? " isn't" : "s aren't"} part of the flow (notes, pictures, or not joined from the start) and ${draft.skipped === 1 ? "is" : "are"} left out.`}
          </p>
          <Input
            name="chatbot_name"
            label="Chatbot name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-fg-faint text-xs">
            It&apos;s saved as a draft and stays off: check the messages, choose what starts it, then publish.
          </p>
        </div>
      ) : (
        <p className="text-fg-muted flex items-start gap-2 text-sm">
          <CircleAlert className="text-danger mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </Modal>
  );
}
