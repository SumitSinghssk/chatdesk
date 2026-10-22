import type { ReactNode } from "react";

import { Badge } from "@/app/admin/_components/ui/index";
import { cn, titleCase } from "@/lib/utils";

type Values = Record<string, unknown> | null | undefined;

function display(value: unknown): ReactNode {
  if (value === undefined) return <span className="text-fg-subtle">—</span>;
  if (value === null || value === "") return <span className="text-fg-subtle italic">empty</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value) && value.every((v) => v === null || typeof v !== "object")) {
    if (value.length === 0) return <span className="text-fg-subtle italic">none</span>;
    return (
      <ul className="list-disc space-y-0.5 pl-4">
        {value.map((v, i) => (
          <li key={i} className="break-words">
            {String(v)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object")
    return <code className="font-mono text-xs break-all">{JSON.stringify(value)}</code>;
  const text = String(value);
  return <span className="break-words">{text.length > 400 ? `${text.slice(0, 400)}…` : text}</span>;
}

function fieldLabel(key: string) {
  return /^[a-z0-9_]+$/.test(key) ? titleCase(key) : key;
}

export function hasChanges(oldValues: Values, newValues: Values) {
  return Object.keys(oldValues ?? {}).length > 0 || Object.keys(newValues ?? {}).length > 0;
}

export function ChangesTable({
  oldValues,
  newValues,
  compact,
}: {
  oldValues: Values;
  newValues: Values;
  compact?: boolean;
}) {
  const before = oldValues ?? {};
  const after = newValues ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const hasOld = Object.keys(before).length > 0;
  const hasNew = Object.keys(after).length > 0;

  if (keys.length === 0)
    return <p className="text-fg-subtle text-sm">No field changes were recorded for this entry.</p>;

  const cell = compact ? "px-2.5 py-1.5" : "px-3 py-2";
  return (
    <div className="border-line overflow-x-auto rounded-xl border">
      <table className={cn("w-full text-left", compact ? "text-xs" : "text-sm")}>
        <thead>
          <tr className="border-line bg-page text-fg-subtle border-b text-[11px] font-semibold tracking-wide uppercase">
            <th className={cell}>Field</th>
            {hasOld && <th className={cell}>Before</th>}
            {hasNew && <th className={cell}>After</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const changed = JSON.stringify(before[key]) !== JSON.stringify(after[key]);
            return (
              <tr key={key} className="border-line border-b align-top last:border-0">
                <td className={cn("text-fg font-medium", cell, !compact && "whitespace-nowrap")}>
                  {fieldLabel(key)}
                  {!compact && hasOld && hasNew && changed && (
                    <Badge tone="yellow" className="ml-2">
                      changed
                    </Badge>
                  )}
                </td>
                {hasOld && <td className={cn("bg-danger-soft/40 text-fg", cell)}>{display(before[key])}</td>}
                {hasNew && <td className={cn("bg-success-soft/40 text-fg", cell)}>{display(after[key])}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
