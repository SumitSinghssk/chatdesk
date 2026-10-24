"use client";

import { useRef, useState, type DragEvent } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import { Button, buttonClasses, ErrorBanner } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import { contactsApi } from "../../_lib/contactsApi";

const MAX_BYTES = 5 * 1024 * 1024;
export const SHEET_ACCEPT =
  ".xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

/** Why a file can't be used, checked before it's sent. */
export function sheetFileProblem(file: File): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls"))
    return "Old .xls files aren't supported. In Excel use Save as → Excel Workbook (.xlsx).";
  if (!/\.(xlsx|xlsm|csv|tsv|txt)$/.test(name)) return "Choose an Excel (.xlsx) or CSV file.";
  if (file.size > MAX_BYTES) return "The file is larger than 5 MB. Split it into smaller files.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

/** Drop zone for a spreadsheet, with the sample files and a few tips. */
export function SheetDrop({ onFile, compact }: { onFile: (file: File) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = sheetFileProblem(file);
    setError(problem ?? "");
    if (!problem) onFile(file);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition",
          compact ? "py-6" : "py-10",
          over ? "border-primary bg-primary-soft" : "border-line-strong bg-page/50"
        )}
      >
        <span className="bg-primary-soft text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <FileSpreadsheet className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-fg text-sm font-semibold">Drop your Excel or CSV file here</p>
        <p className="text-fg-subtle text-xs">.xlsx or .csv · up to 10,000 rows · 5 MB</p>
        <input
          ref={ref}
          type="file"
          accept={SHEET_ACCEPT}
          className="hidden"
          aria-label="Choose a spreadsheet"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button size="sm" leftIcon={Upload} className="mt-1" onClick={() => ref.current?.click()}>
          Choose file
        </Button>
      </div>

      <div className="border-line grid gap-4 rounded-xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <ul className="text-fg-subtle space-y-1 text-xs">
          <li>
            <b className="text-fg font-medium">Phone</b> is required: with country code (+91 98765 43210) or
            10 digits.
          </li>
          <li>
            <b className="text-fg font-medium">Name, Email, Tags</b> are optional. Separate tags with ;
          </li>
          <li>
            <b className="text-fg font-medium">Any other column</b> (City, Order ID…) is saved on the contact
            and can be used in messages.
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 sm:flex-col">
          {(["xlsx", "csv"] as const).map((format) => (
            <a
              key={format}
              href={contactsApi.sampleUrl(format)}
              download
              className={buttonClasses("secondary", "sm", {})}
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              {format === "xlsx" ? "Sample Excel" : "Sample CSV"}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
