"use client";

import { Copy, Download, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/admin/_components/ui/index";
import { useSiteName } from "@/app/admin/_hooks/useSiteName";

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const siteName = useSiteName();
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Recovery codes copied");
    } catch {
      toast.error("Couldn't copy. Select the codes and copy them manually.");
    }
  };

  const download = () => {
    const header = `${siteName} recovery codes\nGenerated ${new Date().toLocaleString()}\nEach code can be used once.\n\n`;
    const url = URL.createObjectURL(new Blob([header + text + "\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-warning/40 bg-warning-soft space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-2">
        <KeyRound size={16} className="text-warning mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="text-fg text-sm font-semibold">Save your recovery codes</p>
          <p className="text-fg-muted text-xs">
            Use one of these if you lose access to your authenticator app. Each code works once. They
            won&apos;t be shown again.
          </p>
        </div>
      </div>
      <ul className="bg-surface text-fg grid grid-cols-2 gap-2 rounded-lg p-3 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="tracking-wider">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" leftIcon={Copy} onClick={copy}>
          Copy
        </Button>
        <Button size="sm" variant="secondary" leftIcon={Download} onClick={download}>
          Download .txt
        </Button>
        <Button size="sm" className="ml-auto" onClick={onDone}>
          I&apos;ve saved them
        </Button>
      </div>
    </div>
  );
}
