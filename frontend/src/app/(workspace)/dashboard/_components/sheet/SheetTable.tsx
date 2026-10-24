"use client";

import { AlertTriangle } from "lucide-react";

import { Badge, type BadgeTone } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import type { SheetRow, SheetRowStatus } from "../../_lib/contactsApi";

const STATUS: Record<SheetRowStatus, { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "success" },
  update: { label: "Update", tone: "info" },
  exists: { label: "Skipped", tone: "neutral" },
  duplicate: { label: "Duplicate", tone: "warning" },
  invalid: { label: "Can't import", tone: "danger" },
};

/** The sheet's rows as they will be imported, with what happens to each one. */
export function SheetTable({ rows, fields }: { rows: SheetRow[]; fields: string[] }) {
  if (rows.length === 0) {
    return (
      <p className="border-line text-fg-subtle rounded-xl border px-4 py-8 text-center text-sm">
        No rows here.
      </p>
    );
  }
  const th =
    "border-line bg-page text-fg-subtle sticky top-0 z-[1] border-b px-3 py-2 text-xs font-medium whitespace-nowrap";
  return (
    <div
      className="border-line max-h-[26rem] overflow-auto rounded-xl border"
      tabIndex={0}
      aria-label="Sheet rows"
    >
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            <th className={cn(th, "w-12 text-right")}>Row</th>
            <th className={th}>Status</th>
            <th className={th}>Phone</th>
            <th className={th}>Name</th>
            <th className={th}>Email</th>
            <th className={th}>Tags</th>
            {fields.map((f) => (
              <th key={f} className={cn(th, "font-mono")}>
                {f}
              </th>
            ))}
            <th className={cn(th, "min-w-56")}>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS[r.status];
            const dim = r.status === "invalid" || r.status === "duplicate" || r.status === "exists";
            const td = "border-line border-b px-3 py-2 align-top";
            return (
              <tr key={r.row} className={cn(dim && "bg-page/60")}>
                <td className={cn(td, "text-fg-faint text-right text-xs tabular-nums")}>{r.row}</td>
                <td className={td}>
                  <Badge tone={s.tone} dot>
                    {s.label}
                  </Badge>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  <span className={cn("block tabular-nums", dim ? "text-fg-subtle" : "text-fg")}>
                    {r.phone || <span className="text-fg-faint">empty</span>}
                  </span>
                  {r.wa_id && `+${r.wa_id}` !== r.phone.replace(/[\s()-]/g, "") && (
                    <span className="text-fg-faint block text-[11px] tabular-nums">+{r.wa_id}</span>
                  )}
                </td>
                <td className={cn(td, "max-w-48 truncate", dim ? "text-fg-subtle" : "text-fg")}>
                  {r.name ?? <span className="text-fg-faint">—</span>}
                </td>
                <td className={cn(td, "text-fg-subtle max-w-56 truncate")}>{r.email ?? "—"}</td>
                <td className={td}>
                  {r.tags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-fg-faint">—</span>
                  )}
                </td>
                {fields.map((f) => (
                  <td key={f} className={cn(td, "text-fg-subtle max-w-48 truncate")}>
                    {r.fields[f] ?? "—"}
                  </td>
                ))}
                <td className={cn(td, "text-xs")}>
                  {r.message && (
                    <span
                      className={cn(
                        "block",
                        r.status === "invalid"
                          ? "text-danger"
                          : r.status === "duplicate"
                            ? "text-warning"
                            : "text-fg-subtle"
                      )}
                    >
                      {r.message}
                    </span>
                  )}
                  {r.warnings.map((w) => (
                    <span key={w} className="text-warning flex items-start gap-1">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                      {w}
                    </span>
                  ))}
                  {!r.message && r.warnings.length === 0 && <span className="text-fg-faint">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
