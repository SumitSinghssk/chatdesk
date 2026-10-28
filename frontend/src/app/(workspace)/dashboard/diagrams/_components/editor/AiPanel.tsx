"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Lightbulb, Plus, Sparkles, Text, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Select, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import type { AiGraph, AiOption, AiSuggestion } from "../../../_lib/diagramsApi";

export interface DiagramAi {
  options: () => Promise<AiOption[]>;
  draw: (prompt: string, kind: AiKind) => Promise<AiGraph>;
  summary: () => Promise<string>;
  suggest: () => Promise<AiSuggestion[]>;
}

export type AiKind = "any" | "flowchart" | "mindmap";
type Tab = "draw" | "explain" | "suggest";

export const AI_KINDS = [
  { value: "any", label: "Let the AI choose" },
  { value: "flowchart", label: "Flowchart" },
  { value: "mindmap", label: "Mind map" },
];

/** Draw from a description, explain the diagram, or find missing steps, with the business's own AI. */
export function AiPanel({
  ai,
  canEdit,
  labelOf,
  onDrawn,
  onAddStep,
  onFocus,
  onClose,
}: {
  ai: DiagramAi;
  canEdit: boolean;
  labelOf: (id: string) => string | null;
  onDrawn: (graph: AiGraph) => void;
  onAddStep: (s: AiSuggestion) => void;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(canEdit ? "draw" : "explain");
  const [options, setOptions] = useState<AiOption[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<AiKind>("any");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<AiSuggestion[] | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  useEffect(() => {
    ai.options()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, [ai]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const tabs: { key: Tab; label: string; icon: typeof Wand2; hidden?: boolean }[] = [
    { key: "draw", label: "Draw", icon: Wand2, hidden: !canEdit },
    { key: "explain", label: "Explain", icon: Text },
    { key: "suggest", label: "Missing steps", icon: Lightbulb, hidden: !canEdit },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line flex items-center justify-between border-b px-3 py-2.5">
        <p className="text-fg flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-violet-500" /> AI
        </p>
        <button
          type="button"
          aria-label="Close AI"
          onClick={onClose}
          className="text-fg-subtle hover:bg-hover rounded-md p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {options === null ? (
        <Spinner className="h-40" />
      ) : options.length === 0 ? (
        <div className="space-y-3 p-4 text-sm">
          <p className="text-fg font-medium">Connect an AI first</p>
          <p className="text-fg-subtle text-[13px]">
            Diagrams use the AI your business connected for the AI agent (Claude, ChatGPT, Gemini…). Nothing
            extra to pay for or set up once it&apos;s connected.
          </p>
          <Link
            href={CUSTOMER_ROUTES.AI_AGENT()}
            className="text-primary text-[13px] font-medium hover:underline"
          >
            Go to AI agent →
          </Link>
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-3 pt-2.5" role="tablist">
            {tabs
              .filter((t) => !t.hidden)
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition",
                    tab === t.key ? "bg-primary-soft text-primary" : "text-fg-subtle hover:bg-hover"
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {tab === "draw" && (
              <>
                <p className="text-fg-subtle text-xs">
                  Describe it in your own words, or paste notes. It&apos;s drawn on this page, next to
                  what&apos;s already here.
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  rows={6}
                  maxLength={4000}
                  aria-label="Describe the diagram"
                  placeholder="e.g. How we handle a WhatsApp enquiry: reply within 5 minutes, ask what they need, share the price list, follow up the next day if no reply…"
                  className="border-line bg-page text-fg focus:border-primary w-full resize-y rounded-lg border p-2.5 text-[13px] outline-none"
                />
                <Select
                  id="ai-kind"
                  label="Draw it as"
                  size="sm"
                  value={kind}
                  onChange={(v) => setKind(v as AiKind)}
                  options={AI_KINDS}
                />
                <Button
                  leftIcon={Wand2}
                  loading={busy}
                  disabled={prompt.trim().length < 3}
                  className="w-full"
                  onClick={() =>
                    void run(async () => {
                      onDrawn(await ai.draw(prompt.trim(), kind));
                      setPrompt("");
                    })
                  }
                >
                  {busy ? "Drawing…" : "Draw it"}
                </Button>
              </>
            )}
            {tab === "explain" && (
              <>
                <p className="text-fg-subtle text-xs">A short explanation of this diagram, in plain words.</p>
                <Button
                  variant={summary ? "secondary" : "primary"}
                  leftIcon={Text}
                  loading={busy}
                  className="w-full"
                  onClick={() => void run(async () => setSummary(await ai.summary()))}
                >
                  {summary ? "Explain again" : "Explain this diagram"}
                </Button>
                {summary && (
                  <div className="border-line bg-page space-y-2 rounded-lg border p-3">
                    <p
                      className="text-fg text-[13px] leading-relaxed whitespace-pre-wrap"
                      data-testid="ai-summary"
                    >
                      {summary}
                    </p>
                    <button
                      type="button"
                      className="text-fg-subtle hover:text-fg flex items-center gap-1 text-xs"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(summary)
                          .then(() => toast.success("Copied"))
                          .catch(() => null)
                      }
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                  </div>
                )}
              </>
            )}
            {tab === "suggest" && (
              <>
                <p className="text-fg-subtle text-xs">
                  Cases not handled, dead ends, a reply that&apos;s missing. Add the ones you agree with.
                </p>
                <Button
                  variant={ideas ? "secondary" : "primary"}
                  leftIcon={Lightbulb}
                  loading={busy}
                  className="w-full"
                  onClick={() =>
                    void run(async () => {
                      setIdeas(await ai.suggest());
                      setAdded(new Set());
                    })
                  }
                >
                  {ideas ? "Look again" : "Find missing steps"}
                </Button>
                {ideas && ideas.length === 0 && (
                  <p className="text-fg-subtle py-4 text-center text-[13px]">
                    Nothing missing that the AI could see.
                  </p>
                )}
                {ideas?.map((s, i) => (
                  <div key={i} className="border-line rounded-lg border p-2.5">
                    <p className="text-fg text-[13px] font-medium">{s.label}</p>
                    {s.why && <p className="text-fg-subtle mt-0.5 text-xs">{s.why}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {s.after && labelOf(s.after) !== null ? (
                        <button
                          type="button"
                          onClick={() => onFocus(s.after!)}
                          className="text-fg-faint hover:text-fg min-w-0 truncate text-[11px]"
                        >
                          After “{labelOf(s.after) || "a shape"}”
                        </button>
                      ) : (
                        <span />
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={Plus}
                        disabled={added.has(i)}
                        onClick={() => {
                          onAddStep(s);
                          setAdded((prev) => new Set(prev).add(i));
                        }}
                      >
                        {added.has(i) ? "Added" : "Add"}
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
