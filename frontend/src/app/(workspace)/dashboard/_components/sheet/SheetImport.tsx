"use client";

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";

import {
  Button,
  ErrorBanner,
  Input,
  Pagination,
  Select,
  Skeleton,
  Switch,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import {
  contactsApi,
  type ImportResult,
  type SheetMapping,
  type SheetPreview,
  type SheetRow,
} from "../../_lib/contactsApi";
import { SheetDrop } from "./SheetDrop";
import { SheetTable } from "./SheetTable";

export type SheetFilter = "all" | "new" | "known" | "duplicate" | "invalid" | "warnings";

const NONE = "__none";
const PER_PAGE = 50;
const ROLES: { key: keyof Omit<SheetMapping, "skip">; label: string; required?: boolean }[] = [
  { key: "phone", label: "Phone number", required: true },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "tags", label: "Tags" },
];

export function matches(row: SheetRow, filter: SheetFilter) {
  if (filter === "all") return true;
  if (filter === "known") return row.status === "update" || row.status === "exists";
  if (filter === "warnings") return row.warnings.length > 0;
  return row.status === filter;
}

/** The rows that can't be imported, as a CSV the person can fix and upload again. */
function downloadProblems(preview: SheetPreview) {
  const bad = preview.rows.filter((r) => r.status === "invalid" || r.status === "duplicate");
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["Row", "Phone", "Name", "Problem"].map(quote).join(","),
    ...bad.map((r) => [String(r.row), r.phone, r.name ?? "", r.message ?? ""].map(quote).join(",")),
  ];
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${preview.filename.replace(/\.[^.]+$/, "")}-problems.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Upload a spreadsheet, match its columns, and check every row before importing.
 * Used by Contacts → Import and by Campaigns → Upload a sheet.
 */
export function SheetImport({
  purpose,
  fixedTag,
  onImported,
  onCancel,
  actionsTarget,
}: {
  purpose: "contacts" | "campaign";
  /** campaigns tag everyone in the sheet so the audience can find them */
  fixedTag?: (filename: string) => string;
  onImported: (result: ImportResult, preview: SheetPreview, file: File) => void;
  onCancel?: () => void;
  /** where the Cancel / Import buttons go, e.g. a dialog's footer; inline when not given */
  actionsTarget?: HTMLElement | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [nonce, setNonce] = useState(0);
  const [mapping, setMapping] = useState<SheetMapping | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [tag, setTag] = useState("");
  const [filter, setFilter] = useState<SheetFilter>("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState("");

  const query = useQuery({
    queryKey: [
      "contacts",
      "sheet-preview",
      file?.name,
      file?.size,
      file?.lastModified,
      nonce,
      mapping,
      updateExisting,
    ],
    queryFn: ({ signal }) => contactsApi.previewSheet(file!, { mapping, updateExisting }, signal),
    enabled: !!file,
    placeholderData: (prev) => prev,
    retry: false,
    staleTime: Infinity,
  });
  const preview = file ? query.data : undefined;
  const current = preview?.mapping ?? mapping;
  const rows = useMemo(() => (preview?.rows ?? []).filter((r) => matches(r, filter)), [preview, filter]);
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const counts = preview?.counts;
  const willAdd = counts ? counts.new : 0;
  const willUpdate = counts ? counts.update : 0;
  const skipped = counts ? counts.invalid + counts.duplicate + counts.exists : 0;
  const tagFor = fixedTag && file ? fixedTag(file.name) : tag.trim();

  const choose = (f: File) => {
    setFile(f);
    setNonce((n) => n + 1);
    setMapping(null);
    setFilter("all");
    setPage(1);
    setImportError("");
  };
  const setRole = (key: keyof Omit<SheetMapping, "skip">, header: string) => {
    if (!current) return;
    const value = header === NONE ? null : header;
    const next: SheetMapping = { ...current, [key]: value, skip: current.skip.filter((h) => h !== value) };
    // one column, one job: take it away from whatever used it before
    for (const r of ROLES) if (r.key !== key && next[r.key] === value) next[r.key] = null;
    setMapping(next);
    setPage(1);
  };
  const toggleCustom = (header: string) => {
    if (!current) return;
    const skip = current.skip.includes(header)
      ? current.skip.filter((h) => h !== header)
      : [...current.skip, header];
    setMapping({ ...current, skip });
  };
  const pickFilter = (f: SheetFilter) => {
    setFilter(f);
    setPage(1);
  };

  const run = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setImportError("");
    try {
      const res = await contactsApi.importSheet(file, {
        mapping: preview.mapping,
        updateExisting,
        tag: tagFor || undefined,
      });
      onImported(res.data, preview, file);
    } catch (err) {
      setImportError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const place = (node: ReactNode) => (actionsTarget ? createPortal(node, actionsTarget) : node);

  if (!file)
    return (
      <>
        <SheetDrop onFile={choose} compact={purpose === "campaign"} />
        {actionsTarget &&
          onCancel &&
          place(
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
      </>
    );

  const error = query.error;
  const fieldErrors = error instanceof CustomerApiError ? error.errors : {};
  const customHeaders = preview
    ? preview.headers.filter((h) => !ROLES.some((r) => current?.[r.key] === h))
    : [];
  const fieldOf = (h: string) =>
    preview?.custom.find((c) => c.column === h)?.field ?? h.trim().toLowerCase().replace(/\s+/g, "_");
  const visibleFields = preview?.custom.map((c) => c.field).filter((f): f is string => !!f) ?? [];
  const filters: { key: SheetFilter; label: string; count: number; tone: string }[] = counts
    ? [
        { key: "all", label: "All rows", count: counts.total, tone: "text-fg" },
        { key: "new", label: "New", count: counts.new, tone: "text-success" },
        {
          key: "known",
          label: updateExisting ? "Already contacts" : "Already contacts (skipped)",
          count: counts.update + counts.exists,
          tone: "text-primary",
        },
        { key: "duplicate", label: "Duplicates", count: counts.duplicate, tone: "text-warning" },
        { key: "invalid", label: "Can't import", count: counts.invalid, tone: "text-danger" },
        { key: "warnings", label: "Warnings", count: counts.warnings, tone: "text-warning" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* the file */}
      <div className="border-line bg-page/50 flex flex-wrap items-center gap-3 rounded-xl border p-3">
        <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <FileSpreadsheet className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate text-sm font-semibold">{file.name}</p>
          <p className="text-fg-subtle text-xs">
            {preview
              ? `${preview.counts.total.toLocaleString()} rows · ${preview.headers.length} columns${preview.sheet ? ` · sheet “${preview.sheet}”` : ""}`
              : "Reading the file…"}
          </p>
        </div>
        <label
          className={cn(
            "border-line bg-surface text-fg hover:bg-hover inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium shadow-xs transition"
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Change file
          <input
            type="file"
            className="hidden"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt"
            aria-label="Choose another spreadsheet"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) choose(f);
            }}
          />
        </label>
      </div>

      {error && !preview && <ErrorBanner message={fieldErrors.file || errorMessage(error)} />}
      {preview?.truncated && (
        <ErrorBanner
          message={`Only the first ${preview.max_rows.toLocaleString()} rows are read. Split the file to import the rest.`}
        />
      )}

      {!preview && !error && (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {preview && current && (
        <>
          {/* columns */}
          <section className="border-line rounded-xl border p-4" aria-label="Match columns">
            <h3 className="text-fg text-sm font-semibold">Match your columns</h3>
            <p className="text-fg-subtle mb-3 text-xs">
              We picked these from the column names. Change any that are wrong.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ROLES.map((r) => (
                <Select
                  key={r.key}
                  id={`sheet-${r.key}`}
                  size="sm"
                  label={r.label}
                  required={r.required}
                  value={current[r.key] ?? NONE}
                  error={
                    fieldErrors[`mapping.${r.key}`] ||
                    (r.required && !current[r.key] ? "Choose the column with the numbers" : undefined)
                  }
                  options={[
                    { value: NONE, label: r.required ? "Choose a column" : "Not in this file" },
                    ...preview.headers.map((h) => ({ value: h, label: h })),
                  ]}
                  onChange={(v) => setRole(r.key, v)}
                />
              ))}
            </div>
            {customHeaders.length > 0 && (
              <div className="mt-4">
                <p className="text-fg-subtle mb-2 text-xs">
                  Other columns are saved on each contact as custom fields, and can fill in campaign messages.
                  Untick any you don&apos;t need.
                </p>
                <div className="flex flex-wrap gap-2">
                  {customHeaders.map((h) => {
                    const on = !current.skip.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleCustom(h)}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
                          on
                            ? "border-primary/40 bg-primary-soft text-fg"
                            : "border-line text-fg-faint hover:text-fg line-through"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px]",
                            on ? "border-primary bg-primary text-primary-fg" : "border-line-strong"
                          )}
                        >
                          {on && "✓"}
                        </span>
                        <span className="truncate font-medium">{h}</span>
                        {on && <span className="text-fg-subtle font-mono">→ {fieldOf(h)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* what will happen */}
          <section aria-label="Check your rows" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-fg text-sm font-semibold">
                Check your rows{" "}
                {query.isFetching && <span className="text-fg-faint font-normal">· updating…</span>}
              </h3>
              {counts && counts.invalid + counts.duplicate > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={Download}
                  onClick={() => downloadProblems(preview)}
                >
                  Download problem rows
                </Button>
              )}
            </div>
            <div role="tablist" aria-label="Show rows" className="mb-3 flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  disabled={f.key !== "all" && f.count === 0}
                  onClick={() => pickFilter(f.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition disabled:cursor-default disabled:opacity-50",
                    filter === f.key
                      ? "border-primary bg-primary-soft text-fg"
                      : "border-line bg-surface text-fg-subtle hover:border-line-strong hover:text-fg"
                  )}
                >
                  {f.label}
                  <span className={cn("font-semibold tabular-nums", f.tone)}>{f.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
            <SheetTable rows={shown} fields={visibleFields} />
            {rows.length > PER_PAGE && (
              <Pagination
                className="mt-2"
                unit="rows"
                meta={{
                  page,
                  per_page: PER_PAGE,
                  total: rows.length,
                  total_pages: Math.ceil(rows.length / PER_PAGE),
                }}
                onPageChange={setPage}
              />
            )}
          </section>

          {/* options */}
          {purpose === "contacts" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Tag everyone in this file (optional)"
                name="import_tag"
                placeholder="e.g. Diwali-2026"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                maxLength={40}
              />
              <Switch
                label="Update contacts that already exist"
                hint="Fills in name and email, adds tags and custom fields. Turn off to leave them as they are."
                checked={updateExisting}
                onChange={(v) => {
                  setUpdateExisting(v);
                  setPage(1);
                }}
              />
            </div>
          ) : (
            tagFor && (
              <p className="text-fg-subtle text-xs">
                Everyone in this sheet is saved to Contacts with the tag{" "}
                <b className="text-fg font-medium">“{tagFor}”</b>, so you can send to them again later.
              </p>
            )
          )}
        </>
      )}

      {importError && <ErrorBanner message={importError} />}

      {place(
        <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <p className="text-fg-subtle min-w-0 flex-1 text-xs" aria-live="polite">
            {counts && (
              <>
                <b className="text-fg">{willAdd.toLocaleString()}</b> new
                {willUpdate > 0 && (
                  <>
                    , <b className="text-fg">{willUpdate.toLocaleString()}</b> updated
                  </>
                )}
                {skipped > 0 && (
                  <>
                    {" "}
                    · <b className="text-fg">{skipped.toLocaleString()}</b> skipped
                  </>
                )}
              </>
            )}
          </p>
          <div className="flex gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              leftIcon={Upload}
              loading={busy}
              disabled={!preview || !current?.phone || query.isFetching || willAdd + willUpdate === 0}
              onClick={run}
            >
              {purpose === "campaign"
                ? `Use ${(willAdd + willUpdate).toLocaleString()} people`
                : `Import ${(willAdd + willUpdate).toLocaleString()} contacts`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
