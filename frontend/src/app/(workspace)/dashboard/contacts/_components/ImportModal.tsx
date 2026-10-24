"use client";

import { useState } from "react";
import { CheckCircle2, Megaphone } from "lucide-react";

import { Button, Modal } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { SheetImport } from "../../_components/sheet/SheetImport";
import type { ImportResult } from "../../_lib/contactsApi";

export function ImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [round, setRound] = useState(0); // a fresh importer for "Import another file"
  const [footer, setFooter] = useState<HTMLDivElement | null>(null); // the importer puts its buttons here

  const close = () => {
    setResult(null);
    setRound((n) => n + 1);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="2xl"
      title="Import contacts"
      description="Upload an Excel or CSV file. You'll see every row and what happens to it before anything is saved."
      footer={
        result ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setResult(null);
                setRound((n) => n + 1);
              }}
            >
              Import another file
            </Button>
            {result.tag && (
              <Button
                variant="secondary"
                leftIcon={Megaphone}
                href={CUSTOMER_ROUTES.CAMPAIGN_NEW({ tag: result.tag })}
              >
                Send them a campaign
              </Button>
            )}
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <div ref={setFooter} className="flex w-full justify-end" />
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <p className="text-fg flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="text-success h-5 w-5" aria-hidden /> Import finished
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["New", result.created, "text-success"],
              ["Updated", result.updated, "text-primary"],
              ["Skipped", result.skipped, result.skipped ? "text-warning" : "text-fg-subtle"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="border-line rounded-xl border p-3">
                <p className={cn("text-2xl font-semibold tabular-nums", tone as string)}>{n}</p>
                <p className="text-fg-subtle text-xs">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-fg-subtle text-xs">
            Phone from “{result.columns.phone}”
            {result.columns.name ? `, name from “${result.columns.name}”` : ""}
            {result.columns.custom.length ? `, custom fields: ${result.columns.custom.join(", ")}` : ""}
            {result.tag ? `. Everyone is tagged “${result.tag}”.` : "."}
          </p>
        </div>
      ) : (
        <SheetImport
          key={round}
          purpose="contacts"
          actionsTarget={footer}
          onCancel={close}
          onImported={(res) => {
            setResult(res);
            onImported();
          }}
        />
      )}
    </Modal>
  );
}
