import { formatYmd } from "../ui/Calendar";

import type { FilterOp, FilterRule, GridColumn, GridFieldType } from "./types";

export const OPERATORS: Record<GridFieldType, { op: FilterOp; label: string }[]> = {
  text: [
    { op: "contains", label: "contains" },
    { op: "not_contains", label: "does not contain" },
    { op: "equals", label: "equals" },
    { op: "starts_with", label: "starts with" },
    { op: "ends_with", label: "ends with" },
    { op: "is_empty", label: "is empty" },
    { op: "is_not_empty", label: "is not empty" },
  ],
  number: [
    { op: "eq", label: "=" },
    { op: "ne", label: "≠" },
    { op: "gt", label: ">" },
    { op: "gte", label: "≥" },
    { op: "lt", label: "<" },
    { op: "lte", label: "≤" },
    { op: "between", label: "between" },
    { op: "is_empty", label: "is empty" },
    { op: "is_not_empty", label: "is not empty" },
  ],
  date: [
    { op: "on", label: "is on" },
    { op: "before", label: "is before" },
    { op: "after", label: "is after" },
    { op: "between", label: "is between" },
    { op: "is_empty", label: "is empty" },
    { op: "is_not_empty", label: "is not empty" },
  ],
  enum: [
    { op: "in", label: "is any of" },
    { op: "not_in", label: "is none of" },
    { op: "is_empty", label: "is empty" },
    { op: "is_not_empty", label: "is not empty" },
  ],
  bool: [
    { op: "is_true", label: "is yes" },
    { op: "is_false", label: "is no" },
  ],
};

const NO_VALUE: FilterOp[] = ["is_empty", "is_not_empty", "is_true", "is_false"];
export const needsValue = (op: FilterOp) => !NO_VALUE.includes(op);

let seq = 0;
export const ruleId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newRule<T>(column: GridColumn<T>): FilterRule {
  const op = OPERATORS[column.type ?? "text"][0]!.op;
  return { id: ruleId(), field: column.id, op, value: column.type === "enum" ? [] : null };
}

export function isComplete(rule: FilterRule) {
  if (!needsValue(rule.op)) return true;
  const v = rule.value;
  if (Array.isArray(v)) return rule.op === "between" ? v.length === 2 && !!v[0] && !!v[1] : v.length > 0;
  return v !== null && v !== "";
}

export function describeRule<T>(rule: FilterRule, column: GridColumn<T> | undefined) {
  const type = column?.type ?? "text";
  const opLabel = OPERATORS[type].find((o) => o.op === rule.op)?.label ?? rule.op;
  if (!needsValue(rule.op)) return { field: column?.header ?? rule.field, op: opLabel, value: "" };
  const show = (v: string) =>
    type === "enum"
      ? (column?.options?.find((o) => o.value === v)?.label ?? v)
      : type === "date"
        ? formatYmd(v)
        : v;
  const value = Array.isArray(rule.value)
    ? rule.op === "between"
      ? rule.value.map(show).join(" – ")
      : rule.value.map(show).join(", ")
    : show(rule.value ?? "");
  return { field: column?.header ?? rule.field, op: opLabel, value };
}

export const toApiFilters = (rules: FilterRule[]) =>
  rules.filter(isComplete).map(({ field, op, value }) => ({ field, op, value }));
