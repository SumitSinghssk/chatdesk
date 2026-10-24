import { Plug } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ProviderKey } from "../../_lib/aiAgentApi";
import { LOGOS } from "./providerLogos";

// one-colour logos take this colour; the others keep their own
const INK: Partial<Record<ProviderKey, string>> = {
  openai: "text-[#0d0d0d] dark:text-white",
  groq: "text-[#f55036]",
  openrouter: "text-[#4b5563] dark:text-slate-200",
};

const BOX = { sm: "h-6 w-6 rounded-md p-1", md: "h-9 w-9 rounded-lg p-1.5", lg: "h-11 w-11 rounded-xl p-2" };

/** The AI provider's logo on a small tile. */
export function ProviderMark({
  provider,
  size = "md",
}: {
  provider: ProviderKey;
  size?: "sm" | "md" | "lg";
}) {
  const logo = LOGOS[provider];
  return (
    <span
      aria-hidden
      className={cn(
        "border-line inline-flex shrink-0 items-center justify-center border bg-white dark:bg-slate-900",
        BOX[size],
        INK[provider]
      )}
    >
      {logo ? (
        <span className="block h-full w-full" dangerouslySetInnerHTML={{ __html: logo }} />
      ) : (
        <Plug className="text-fg-subtle h-full w-full" />
      )}
    </span>
  );
}
