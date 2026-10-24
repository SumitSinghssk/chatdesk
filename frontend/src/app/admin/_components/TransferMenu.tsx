"use client";

import { useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, FileDown, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  DataTable,
  RadioGroup,
  Dropdown,
  ErrorBanner,
  Modal,
  Spinner,
  Tooltip,
  type BadgeTone,
  type Column,
} from "./ui/index";
import {
  transferApi,
  type ImportMode,
  type ImportPreview,
  type ImportResult,
  type PreviewRow,
  type TransferType,
} from "@/app/admin/_lib/api/transferApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

const STATUS: Record<PreviewRow["status"], { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "success" },
  exists: { label: "Exists", tone: "info" },
  duplicate: { label: "Duplicate", tone: "neutral" },
  invalid: { label: "Invalid", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

export interface TransferMenuProps {
  type: TransferType;
  queryKey: string | readonly unknown[];
  canExport: boolean;
  canImport: boolean;
  compact?: boolean;
}

export function TransferMenu({ type, queryKey, canExport, canImport, compact }: TransferMenuProps) {
  const [busy, setBusy] = useState<"export" | "template" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  if (!canExport && !canImport) return null;

  const download = async (kind: "export" | "template") => {
    setBusy(kind);
    try {
      await (kind === "export" ? transferApi.exportCsv(type) : transferApi.template(type));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't download the file"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dropdown
        width="w-56"
        trigger={(open) =>
          compact ? (
            <Tooltip label="Import / Export" align="end">
              <Button
                variant="secondary"
                iconOnly
                leftIcon={FileSpreadsheet}
                loading={!!busy}
                aria-label="Import / Export"
                aria-expanded={open}
                className="h-9 w-9"
              />
            </Tooltip>
          ) : (
            <Button
              variant="secondary"
              leftIcon={FileSpreadsheet}
              rightIcon={ChevronDown}
              loading={!!busy}
              aria-expanded={open}
            >
              Import / Export
            </Button>
          )
        }
        items={[
          { label: "Export CSV", icon: Download, onClick: () => download("export"), hidden: !canExport },
          {
            label: "Download template",
            icon: FileDown,
            onClick: () => download("template"),
            hidden: !canImport,
          },
          { label: "Import CSV…", icon: Upload, onClick: () => setImportOpen(true), hidden: !canImport },
        ]}
      />
      {canImport && importOpen && (
        <ImportModal
          type={type}
          queryKey={queryKey}
          onClose={() => setImportOpen(false)}
          onTemplate={() => download("template")}
        />
      )}
    </>
  );
}

function ImportModal({
  type,
  queryKey,
  onClose,
  onTemplate,
}: {
  type: TransferType;
  queryKey: TransferMenuProps["queryKey"];
  onClose: () => void;
  onTemplate: () => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>("create");
  const [result, setResult] = useState<ImportResult | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv"))
      return setError("Upload a .csv file (in Excel: File → Save as → CSV UTF-8).");
    if (file.size > MAX_BYTES) return setError("The file can be at most 10 MB.");
    setLoading(true);
    try {
      setPreview(await transferApi.preview(type, file));
      setMode("create");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't read the file"));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files[0]);
  };

  const runImport = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await transferApi.import(type, preview.token, mode);
      setResult(res.data);
      if (res.data.created + res.data.updated > 0) {
        toast.success(res.message ?? "Import finished");
        queryClient.invalidateQueries({
          queryKey: typeof queryKey === "string" ? [queryKey] : [...queryKey],
        });
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Import failed"));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const counts = preview?.counts;
  const willImport = counts ? counts.new + (mode === "create_update" ? counts.exists : 0) : 0;

  const footer = result ? (
    <>
      <Button variant="ghost" onClick={reset}>
        Import another file
      </Button>
      <Button onClick={onClose}>Done</Button>
    </>
  ) : preview ? (
    <>
      <Button variant="ghost" onClick={reset} disabled={loading}>
        Choose another file
      </Button>
      <Button leftIcon={FileUp} onClick={runImport} loading={loading} disabled={!willImport}>
        {willImport
          ? `Import ${willImport.toLocaleString()} ${willImport === 1 ? "row" : "rows"}`
          : "Nothing to import"}
      </Button>
    </>
  ) : (
    <Button variant="ghost" onClick={onClose}>
      Cancel
    </Button>
  );

  return (
    <Modal
      open
      onClose={loading ? () => undefined : onClose}
      size="lg"
      variant="modal"
      title="Import from CSV"
      description={preview ? preview.filename : "Check every row before anything is saved."}
      footer={footer}
      closeOnBackdrop={!loading}
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}

        {result ? (
          <ImportSummary result={result} />
        ) : preview ? (
          <>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(preview.counts) as (keyof ImportPreview["counts"])[]).map((key) => (
                <Badge key={key} tone={STATUS[key].tone}>
                  <span className="tabular">{preview.counts[key].toLocaleString()}</span>{" "}
                  {STATUS[key].label.toLowerCase()}
                </Badge>
              ))}
              <span className="text-fg-subtle ml-auto text-xs">
                {preview.total.toLocaleString()} rows in the file
              </span>
            </div>

            {preview.unknown_columns.length > 0 && (
              <p className="border-line bg-warning-soft text-warning rounded-lg border px-3 py-2 text-xs">
                Ignored columns: {preview.unknown_columns.join(", ")}. Expected: {preview.columns.join(", ")}.
              </p>
            )}

            <PreviewTable rows={preview.rows} />
            {preview.total > preview.rows.length && (
              <p className="text-fg-subtle text-xs">
                Showing the first {preview.rows.length} of {preview.total.toLocaleString()} rows.
              </p>
            )}

            <RadioGroup<ImportMode>
              label="What should happen?"
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: "create",
                  label: "Only add new rows",
                  description: "Rows that already exist are left untouched.",
                },
                ...(preview.can_update && preview.counts.exists > 0
                  ? [
                      {
                        value: "create_update" as const,
                        label: `Add new rows and update ${preview.counts.exists.toLocaleString()} existing`,
                        description: "Existing rows are overwritten with the values from the file.",
                      },
                    ]
                  : []),
              ]}
            />
          </>
        ) : (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
                dragging
                  ? "border-primary bg-primary-soft"
                  : "border-line hover:border-line-strong hover:bg-hover"
              )}
            >
              {loading ? (
                <Spinner />
              ) : (
                <span className="border-line bg-surface text-fg-subtle flex h-11 w-11 items-center justify-center rounded-xl border">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
              )}
              <span className="text-fg text-sm font-semibold">
                {loading ? "Checking the file…" : "Drop a CSV file here, or click to choose"}
              </span>
              <span className="text-fg-subtle text-xs">.csv up to 10 MB and 5,000 rows</span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={loading}
                onChange={(e) => void pick(e.target.files?.[0])}
              />
            </label>
            <p className="text-fg-subtle text-xs">
              Start from the{" "}
              <Button variant="link" size="xs" onClick={onTemplate}>
                CSV template
              </Button>{" "}
              to get the right column names. Nothing is saved until you confirm on the next step.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

const PREVIEW_COLUMNS: Column<PreviewRow>[] = [
  {
    key: "line",
    header: "Line",
    headerClassName: "w-14",
    className: "tabular text-xs text-fg-subtle align-top",
    cell: (row) => row.line,
  },
  {
    key: "label",
    header: "Row",
    className: "max-w-56 truncate text-fg align-top",
    cell: (row) => <span title={row.label}>{row.label || <span className="text-fg-faint">—</span>}</span>,
  },
  {
    key: "status",
    header: "Status",
    headerClassName: "w-24",
    className: "align-top",
    cell: (row) => <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>,
  },
  {
    key: "notes",
    header: "Notes",
    className: "text-xs align-top",
    cell: (row) => (
      <>
        {row.messages.map((m, i) => (
          <p
            key={`m${i}`}
            className={row.status === "invalid" || row.status === "failed" ? "text-danger" : "text-fg-subtle"}
          >
            {m}
          </p>
        ))}
        {row.warnings.map((w, i) => (
          <p key={`w${i}`} className="text-warning">
            {w}
          </p>
        ))}
      </>
    ),
  },
];

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="border-line max-h-80 overflow-auto rounded-lg border">
      <DataTable columns={PREVIEW_COLUMNS} rows={rows} getRowId={(row) => row.line} stickyHeader />
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  const stats: { label: string; value: number; tone: string }[] = [
    { label: "Created", value: result.created, tone: "text-success" },
    { label: "Updated", value: result.updated, tone: "text-info" },
    { label: "Skipped", value: result.skipped, tone: "text-fg-muted" },
    { label: "Failed", value: result.failed, tone: "text-danger" },
  ];
  return (
    <div className="space-y-4">
      <dl className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3">
            <dt className="text-fg-subtle text-[11px]">{s.label}</dt>
            <dd className={cn("tabular text-lg font-semibold", s.tone)}>{s.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      {result.errors.length > 0 ? (
        <>
          <p className="text-fg text-sm font-semibold">Rows that weren&apos;t imported</p>
          <PreviewTable rows={result.errors} />
        </>
      ) : (
        <p className="text-fg-subtle text-sm">No rows had errors.</p>
      )}
    </div>
  );
}
