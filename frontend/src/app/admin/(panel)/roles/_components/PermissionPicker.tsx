"use client";

import { Checkbox, Skeleton } from "@/app/admin/_components/ui/index";
import type { PermissionGroup } from "@/app/admin/_lib/api/rolesApi";

export function actionLabel(name: string) {
  const action = name.split(".").slice(1).join(".") || name;
  const text = action.replace(/[_.]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function PermissionPicker({
  groups,
  value,
  onChange,
  inherited,
  disabled,
  loading,
}: {
  groups: PermissionGroup[] | undefined;
  value: number[];
  onChange: (ids: number[]) => void;
  inherited?: Set<number>;
  disabled?: boolean;
  loading?: boolean;
}) {
  const selected = new Set(value);

  if (loading || !groups) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const setMany = (ids: number[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange([...next]);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((group) => {
        const ids = group.permissions.filter((p) => !inherited?.has(p.id)).map((p) => p.id);
        const count = ids.filter((id) => selected.has(id)).length;
        return (
          <fieldset key={group.group} className="border-line rounded-xl border p-3">
            <legend className="sr-only">{group.group}</legend>
            <div className="border-line mb-2 flex items-center justify-between gap-2 border-b pb-2">
              <Checkbox
                label={<span className="font-semibold">{group.group}</span>}
                checked={ids.length > 0 && count === ids.length}
                indeterminate={count > 0 && count < ids.length}
                disabled={disabled || ids.length === 0}
                onChange={(on) => setMany(ids, on)}
                aria-label={`Select all ${group.group} permissions`}
              />
              <span className="text-fg-subtle text-xs">
                {group.permissions.filter((p) => selected.has(p.id) || inherited?.has(p.id)).length}/
                {group.permissions.length}
              </span>
            </div>
            <div className="grid gap-1.5">
              {group.permissions.map((p) => {
                const viaRole = inherited?.has(p.id);
                return (
                  <Checkbox
                    key={p.id}
                    checked={viaRole || selected.has(p.id)}
                    disabled={disabled || viaRole}
                    onChange={(on) => setMany([p.id], on)}
                    label={
                      <>
                        {actionLabel(p.name)}
                        {viaRole && <span className="text-fg-subtle ml-1.5 text-xs">(via role)</span>}
                      </>
                    }
                    hint={<span className="font-mono">{p.name}</span>}
                  />
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
