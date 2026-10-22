"use client";

import { Input, Select } from "@/app/admin/_components/ui/index";

import type { VariableSource } from "../../../_lib/campaignsApi";
import { SOURCES } from "../labels";

/** One template variable: where its value comes from for each person, plus a fallback. */
export function VariableRow({
  id,
  label,
  value,
  onChange,
  attributes,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: VariableSource;
  onChange: (value: VariableSource) => void;
  attributes: string[];
  error?: string;
  placeholder?: string | null;
}) {
  return (
    <div className="border-line bg-page grid gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-center">
        <span className="bg-surface border-line text-fg rounded-md border px-2 py-1 font-mono text-xs font-semibold">
          {label}
        </span>
      </div>
      <Select
        id={`${id}-source`}
        label="Value"
        size="sm"
        value={value.source}
        options={SOURCES}
        onChange={(source) =>
          onChange({
            ...value,
            source: source as VariableSource["source"],
            value: source === value.source ? value.value : null,
          })
        }
      />
      {value.source === "static" ? (
        <Input
          id={`${id}-value`}
          name={`${id}-value`}
          label="Text"
          value={value.value ?? ""}
          placeholder={placeholder ?? "Type the text"}
          error={error}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      ) : value.source === "attribute" ? (
        <Select
          id={`${id}-attribute`}
          label="Custom field"
          size="sm"
          searchable
          value={value.value ?? ""}
          placeholder={attributes.length ? "Choose a field" : "No custom fields yet"}
          options={attributes.map((a) => ({ value: a, label: a }))}
          error={error}
          onChange={(v) => onChange({ ...value, value: v })}
        />
      ) : (
        <Input
          id={`${id}-fallback`}
          name={`${id}-fallback`}
          label="If empty, use"
          value={value.fallback ?? ""}
          placeholder={value.source === "first_name" || value.source === "name" ? "there" : "Fallback text"}
          error={error}
          onChange={(e) => onChange({ ...value, fallback: e.target.value })}
        />
      )}
      {value.source === "attribute" && (
        <Input
          id={`${id}-fallback`}
          name={`${id}-fallback`}
          label="If empty, use"
          value={value.fallback ?? ""}
          placeholder="Fallback text"
          onChange={(e) => onChange({ ...value, fallback: e.target.value })}
          wrapperClassName="sm:col-start-3"
        />
      )}
    </div>
  );
}
