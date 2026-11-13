"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Languages,
  ListChecks,
  MessageSquareReply,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Modal, Select } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { AI_ASSIST_QK, aiAssistApi, type AssistAction, type AssistTone } from "../../_lib/aiAssistApi";
import { Tooltip } from "../../_components/Tooltip";
import { WaText } from "../../_components/whatsapp/WaText";

const ACTIONS: { key: AssistAction; label: string; hint: string; icon: LucideIcon }[] = [
  {
    key: "suggest",
    label: "Suggest a reply",
    hint: "A draft for the customer's last message",
    icon: MessageSquareReply,
  },
  {
    key: "summarize",
    label: "Summarize the chat",
    hint: "Up to 6 points for whoever picks it up",
    icon: ListChecks,
  },
  {
    key: "translate",
    label: "Translate",
    hint: "Your draft, or the customer's last message",
    icon: Languages,
  },
  {
    key: "rewrite",
    label: "Rewrite my draft",
    hint: "Friendly, professional, concise or apologetic",
    icon: Wand2,
  },
];

const TONES: { value: AssistTone; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "concise", label: "Concise" },
  { value: "apologetic", label: "Apologetic" },
];

const LANGUAGES = [
  "English",
  "Hindi",
  "Hinglish",
  "Marathi",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Bengali",
  "Arabic",
  "Spanish",
];

/** AI help in the composer. Nothing is sent from here: results go into the reply box (or a note) first. */
export function AiAssistButton({
  conversationId,
  draft,
  onUseText,
  onSaveNote,
}: {
  conversationId: number;
  /** what's in the reply box now */
  draft: string;
  /** puts text in the reply box */
  onUseText: (text: string) => void;
  /** saves text as an internal note */
  onSaveNote: (text: string) => Promise<boolean>;
}) {
  const status = useQuery({
    queryKey: AI_ASSIST_QK.STATUS,
    queryFn: async () => (await aiAssistApi.status()).data,
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<AssistAction>("suggest");
  const [tone, setTone] = useState<AssistTone>("friendly");
  const [language, setLanguage] = useState("English");
  const [fromDraft, setFromDraft] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ action: AssistAction; text: string } | null>(null);

  if (!status.data?.enabled) return null;
  const hasDraft = !!draft.trim();

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const body =
        action === "rewrite"
          ? { text: draft, tone }
          : action === "translate"
            ? { text: fromDraft && hasDraft ? draft : undefined, language }
            : {};
      const res = await aiAssistApi.run(conversationId, action, body);
      setResult(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
      void status.refetch(); // e.g. the budget ran out
    } finally {
      setBusy(false);
    }
  };

  const use = (text: string) => {
    onUseText(text);
    setOpen(false);
    setResult(null);
  };
  // translating the customer's message is for reading, not for sending
  const sendable =
    result && (result.action !== "translate" || (fromDraft && hasDraft)) && result.action !== "summarize";

  return (
    <>
      <Tooltip label="AI assist" side="top" align="start">
        <Button
          iconOnly
          variant="ghost"
          leftIcon={Sparkles}
          aria-label="AI assist"
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="AI assist"
        description="Nothing is sent to the customer from here: you check the result first."
        footer={
          status.data.ready ? (
            <Button
              leftIcon={Sparkles}
              loading={busy}
              disabled={action === "rewrite" && !hasDraft}
              onClick={run}
            >
              {result ? "Try again" : "Go"}
            </Button>
          ) : undefined
        }
      >
        {!status.data.ready ? (
          <p className="bg-warning-soft text-warning rounded-lg p-3 text-sm">{status.data.problem}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What should the AI do?">
              {ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  role="radio"
                  aria-checked={action === a.key}
                  onClick={() => {
                    setAction(a.key);
                    setResult(null);
                  }}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition",
                    action === a.key ? "border-primary bg-primary-soft" : "border-line hover:bg-hover"
                  )}
                >
                  <a.icon className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="text-fg block text-sm font-medium">{a.label}</span>
                    <span className="text-fg-subtle block text-xs">{a.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            {action === "rewrite" && (
              <div className="space-y-2">
                <Select
                  label="Tone"
                  value={tone}
                  options={TONES}
                  onChange={(v) => setTone(v as AssistTone)}
                />
                {!hasDraft && <p className="text-fg-subtle text-xs">Write a draft in the reply box first.</p>}
              </div>
            )}
            {action === "translate" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Into"
                  list="ai-assist-languages"
                  value={language}
                  maxLength={40}
                  onChange={(e) => setLanguage(e.target.value)}
                />
                <datalist id="ai-assist-languages">
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
                <Select
                  label="What"
                  value={fromDraft && hasDraft ? "draft" : "customer"}
                  options={[
                    ...(hasDraft ? [{ value: "draft", label: "My draft" }] : []),
                    { value: "customer", label: "The customer's last message" },
                  ]}
                  onChange={(v) => setFromDraft(v === "draft")}
                />
              </div>
            )}

            {busy && (
              <p className="text-fg-subtle flex items-center gap-2 text-sm">
                <Sparkles className="text-primary h-4 w-4 animate-pulse" aria-hidden /> Thinking…
              </p>
            )}
            {result && (
              <div className="border-line bg-page space-y-3 rounded-lg border p-3">
                <div className="text-fg text-sm leading-6 break-words whitespace-pre-wrap">
                  <WaText text={result.text} />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={Copy}
                    onClick={async () => {
                      await navigator.clipboard.writeText(result.text).catch(() => null);
                      toast.success("Copied");
                    }}
                  >
                    Copy
                  </Button>
                  {result.action === "summarize" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (await onSaveNote(result.text)) {
                          toast.success("Saved as a note");
                          setOpen(false);
                          setResult(null);
                        }
                      }}
                    >
                      Save as note
                    </Button>
                  )}
                  {sendable && (
                    <Button size="sm" onClick={() => use(result.text)}>
                      Put in reply box
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
