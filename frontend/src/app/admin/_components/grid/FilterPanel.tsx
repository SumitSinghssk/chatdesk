"use client";

import { useState } from "react";
import { ListFilter, Plus, Trash2 } from "lucide-react";

import { DatePicker } from "../ui/DatePicker";
import { DateRangePicker } from "../ui/DateRangePicker";
import { Input } from "../ui/Input";
import { MultiSelect } from "../ui/MultiSelect";
import { Select } from "../ui/Select";
import { usePopover } from "../ui/usePopover";
import { GridPopover, ToolbarIconButton } from "./GridPopover";
import { OPERATORS, isComplete, needsValue, newRule } from "./operators";
import type { FilterOp, FilterRule, FilterValue, GridColumn } from "./types";

export function FilterPanel<T>({
  columns,
  applied,
  match,
  onApply,
  seed,
}: {
  columns: GridColumn<T>[];
  applied: FilterRule[];
  match: "and" | "or";
  onApply: (rules: FilterRule[], match: "and" | "or") => void;
  seed: { n: number; column?: string };
}) {
  const popover = usePopover({ matchWidth: false, maxHeight: 520 });
  const filterable = columns.filter((c) => c.type);
  const [draft, setDraft] = useState<FilterRule[]>([]);
  const [draftMatch, setDraftMatch] = useState(match);

  const start = (column?: string) => {
    const col = filterable.find((c) => c.id === column);
    const base = applied.length ? applied : [];
    const withSeed = col
      ? [...base, newRule(col)]
      : base.length
        ? base
        : filterable[0]
          ? [newRule(filterable[0])]
          : [];
    setDraft(withSeed);
    setDraftMatch(match);
    popover.setOpen(true);
  };

  const [seenSeed, setSeenSeed] = useState(seed.n);
  if (seed.n !== seenSeed) {
    setSeenSeed(seed.n);
    start(seed.column);
  }

  const update = (id: string, patch: Partial<FilterRule>) =>
    setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const apply = (rules: FilterRule[] = draft) => {
    onApply(rules.filter(isComplete), draftMatch);
    popover.setOpen(false);
  };
  const activeCount = applied.length;

  return (
    <GridPopover
      popover={popover}
      label="Filters"
      className="w-[min(44rem,calc(100vw-1rem))] p-0"
      trigger={({ ref, open }) => (
        <ToolbarIconButton
          refCb={ref}
          active={open}
          onClick={() => (open ? popover.setOpen(false) : start())}
          label="Filters"
          icon={ListFilter}
          badge={activeCount}
        />
      )}
    >
      <div className="border-line border-b px-4 py-3">
        <p className="text-fg text-sm font-semibold">Filters</p>
        <p className="text-fg-subtle text-xs">Narrow the list by any column. Rules apply together.</p>
      </div>

      <div className="space-y-2 px-4 py-3">
        {draft.length === 0 && (
          <p className="text-fg-subtle py-4 text-center text-sm">No filters. Add one below.</p>
        )}
        {draft.map((rule, i) => {
          const column = filterable.find((c) => c.id === rule.field) ?? filterable[0]!;
          const type = column.type!;
          return (
            <div
              key={rule.id}
              className="grid grid-cols-[4.5rem_1fr] items-start gap-2 sm:grid-cols-[4.5rem_10rem_9.5rem_minmax(0,1fr)_2.25rem]"
            >
              <div className="text-fg-subtle flex h-9 items-center text-xs font-medium">
                {i === 0 ? (
                  "Where"
                ) : i === 1 ? (
                  <Select
                    size="sm"
                    aria-label="Combine rules"
                    searchable={false}
                    value={draftMatch}
                    onChange={(v) => setDraftMatch(v as "and" | "or")}
                    options={[
                      { value: "and", label: "And" },
                      { value: "or", label: "Or" },
                    ]}
                    className="h-8 px-2 text-xs"
                  />
                ) : (
                  <span className="pl-2 capitalize">{draftMatch}</span>
                )}
              </div>
              <Select
                size="sm"
                aria-label="Column"
                value={rule.field}
                options={filterable.map((c) => ({ value: c.id, label: c.header }))}
                onChange={(field) => {
                  const next = filterable.find((c) => c.id === field)!;
                  update(rule.id, { ...newRule(next), id: rule.id });
                }}
              />
              <Select
                size="sm"
                aria-label="Operator"
                searchable={false}
                value={rule.op}
                options={OPERATORS[type].map((o) => ({ value: o.op, label: o.label }))}
                onChange={(op) => {
                  const nextOp = op as FilterOp;
                  const keepValue = (nextOp === "between") === (rule.op === "between") && needsValue(nextOp);
                  update(rule.id, {
                    op: nextOp,
                    value: keepValue ? rule.value : type === "enum" ? [] : null,
                  });
                }}
                wrapperClassName="col-start-2 sm:col-start-auto"
              />
              <div className="col-start-2 min-w-0 sm:col-start-auto">
                <ValueEditor column={column} rule={rule} onChange={(value) => update(rule.id, { value })} />
              </div>
              <button
                type="button"
                aria-label="Remove filter"
                onClick={() => setDraft((d) => d.filter((r) => r.id !== rule.id))}
                className="text-fg-faint hover:bg-danger-soft hover:text-danger col-start-2 flex h-9 w-9 items-center justify-center justify-self-start rounded-lg transition sm:col-start-auto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-line flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <button
          type="button"
          onClick={() => filterable[0] && setDraft((d) => [...d, newRule(filterable[0]!)])}
          className="text-primary hover:bg-primary-soft inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Add filter
        </button>
        <div className="ml-auto flex gap-2">
          {(draft.length > 0 || activeCount > 0) && (
            <button
              type="button"
              onClick={() => apply([])}
              className="text-fg-subtle hover:bg-hover hover:text-fg h-8 rounded-lg px-3 text-sm"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={() => apply()}
            className="bg-primary text-primary-fg hover:bg-primary-hover h-8 rounded-lg px-3.5 text-sm font-semibold"
          >
            Apply
          </button>
        </div>
      </div>
    </GridPopover>
  );
}

function ValueEditor<T>({
  column,
  rule,
  onChange,
}: {
  column: GridColumn<T>;
  rule: FilterRule;
  onChange: (value: FilterValue) => void;
}) {
  if (!needsValue(rule.op))
    return <div className="text-fg-faint flex h-9 items-center text-xs">No value needed</div>;
  const type = column.type!;
  const pair = Array.isArray(rule.value) ? rule.value : ["", ""];
  const single = typeof rule.value === "string" ? rule.value : "";

  if (type === "enum") {
    return (
      <MultiSelect
        aria-label="Values"
        placeholder="Pick values…"
        options={column.options ?? []}
        value={Array.isArray(rule.value) ? rule.value : []}
        onChange={onChange}
        maxChips={2}
      />
    );
  }
  if (type === "date") {
    return rule.op === "between" ? (
      <DateRangePicker
        size="sm"
        aria-label="Date range"
        value={{ from: pair[0] ?? "", to: pair[1] ?? "" }}
        onChange={({ from, to }) => onChange(from || to ? [from, to || from] : [])}
      />
    ) : (
      <DatePicker
        size="sm"
        aria-label="Date"
        placeholder="Pick a date"
        value={single}
        onChange={(v) => onChange(v || null)}
      />
    );
  }
  if (rule.op === "between") {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          aria-label="From"
          placeholder="From"
          className="h-9"
          value={pair[0] ?? ""}
          onChange={(e) => onChange([e.target.value, pair[1] ?? ""])}
        />
        <span className="text-fg-faint">–</span>
        <Input
          type="number"
          aria-label="To"
          placeholder="To"
          className="h-9"
          value={pair[1] ?? ""}
          onChange={(e) => onChange([pair[0] ?? "", e.target.value])}
        />
      </div>
    );
  }
  return (
    <Input
      type={type === "number" ? "number" : "text"}
      aria-label="Value"
      placeholder="Value"
      className="h-9"
      value={single}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
