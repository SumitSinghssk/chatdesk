"use client";

import { useRef, useState, type DragEvent } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button, ErrorBanner, Input, Modal, Switch } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { contactsApi, type ImportResult } from "../../_lib/contactsApi";

const SAMPLE =
  "phone,name,email,tags,city\n+91 98765 43210,Asha Verma,asha@example.com,VIP;Lead,Delhi\n9876543211,Ravi Kumar,,Wholesale,Pune\n";

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "contacts-sample.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [over, setOver] = useState(false);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError("");
    setTag("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) {
      setError("Choose a .csv file. In Excel or Google Sheets use File → Download / Save as → CSV.");
      return;
    }
    setError("");
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files[0]);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await contactsApi.importCsv(file, { tag: tag.trim() || undefined, updateExisting });
      setResult(res.data);
      toast.success(res.message ?? "Import finished");
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Import contacts"
      description="Upload a CSV with a phone column. Name, email, tags and any other columns (like city) are imported too."
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={reset}>
              Import another file
            </Button>
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button leftIcon={Upload} disabled={!file} loading={busy} onClick={run}>
              Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
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
          <p className="text-fg-subtle flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="text-success h-4 w-4" />
            Read phone from “{result.columns.phone}”
            {result.columns.name ? `, name from “${result.columns.name}”` : ""}
            {result.columns.custom.length ? `, custom fields: ${result.columns.custom.join(", ")}` : ""}.
          </p>
          {result.errors.length > 0 && (
            <div className="border-line max-h-48 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-page text-fg-subtle sticky top-0 text-left">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Row</th>
                    <th className="px-3 py-1.5 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {result.errors.map((e) => (
                    <tr key={`${e.row}-${e.message}`}>
                      <td className="text-fg-subtle px-3 py-1.5 tabular-nums">{e.row}</td>
                      <td className="text-fg px-3 py-1.5">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
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
              "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
              over ? "border-primary bg-primary-soft" : "border-line-strong"
            )}
          >
            <span className="bg-primary-soft text-primary flex h-11 w-11 items-center justify-center rounded-full">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            {file ? (
              <p className="text-fg text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-fg text-sm font-medium">Drop a CSV file here</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              {file ? "Choose another file" : "Choose file"}
            </Button>
            <button
              type="button"
              onClick={downloadSample}
              className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download a sample CSV
            </button>
          </div>
          <Input
            label="Tag every imported contact (optional)"
            name="import_tag"
            placeholder="e.g. Diwali-2026"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            maxLength={40}
          />
          <Switch
            label="Update contacts that already exist"
            hint="Fills in name/email, adds tags and custom fields. Turn off to skip existing numbers."
            checked={updateExisting}
            onChange={setUpdateExisting}
          />
        </div>
      )}
    </Modal>
  );
}
