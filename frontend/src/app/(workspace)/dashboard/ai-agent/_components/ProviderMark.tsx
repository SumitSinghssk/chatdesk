import { cn } from "@/lib/utils";

import type { ProviderKey } from "../../_lib/aiAgentApi";

const MARKS: Record<ProviderKey, { letter: string; className: string }> = {
  anthropic: { letter: "C", className: "bg-[#d97757] text-white" },
  openai: { letter: "G", className: "bg-[#10a37f] text-white" },
  gemini: {
    letter: "G",
    className: "bg-gradient-to-br from-[#4285f4] via-[#9b72cb] to-[#d96570] text-white",
  },
  groq: { letter: "Q", className: "bg-[#f55036] text-white" },
  deepseek: { letter: "D", className: "bg-[#4d6bfe] text-white" },
  mistral: { letter: "M", className: "bg-[#fa520f] text-white" },
  openrouter: { letter: "R", className: "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" },
  custom: { letter: "+", className: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100" },
};

/** A small coloured initial for each AI provider (not their logo). */
export function ProviderMark({
  provider,
  size = "md",
}: {
  provider: ProviderKey;
  size?: "sm" | "md" | "lg";
}) {
  const mark = MARKS[provider] ?? MARKS.custom;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-bold",
        { sm: "h-6 w-6 text-xs", md: "h-9 w-9 text-sm", lg: "h-11 w-11 text-base" }[size],
        mark.className
      )}
    >
      {mark.letter}
    </span>
  );
}
