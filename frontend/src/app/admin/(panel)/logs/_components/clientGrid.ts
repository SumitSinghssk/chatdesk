import type { FilterRule, SortRule } from "@/app/admin/_components/grid";

export type ClientField<T> = {
  type: "text" | "number" | "date";
  get: (row: T) => string | number | null | undefined;
};

const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");

function matches<T>(row: T, rule: FilterRule, field: ClientField<T>): boolean {
  const raw = field.get(row);
  const empty = raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
  if (rule.op === "is_empty") return empty;
  if (rule.op === "is_not_empty") return !empty;
  const value = rule.value;
  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return true;

  if (field.type === "text") {
    const hay = String(raw ?? "").toLowerCase();
    const needle = String(value).toLowerCase();
    switch (rule.op) {
      case "contains":
        return hay.includes(needle);
      case "not_contains":
        return !hay.includes(needle);
      case "equals":
        return hay === needle;
      case "starts_with":
        return hay.startsWith(needle);
      case "ends_with":
        return hay.endsWith(needle);
      default:
        return true;
    }
  }

  if (empty) return false;
  if (field.type === "number") {
    const n = Number(raw);
    if (rule.op === "between" && Array.isArray(value)) {
      const [lo, hi] = value.map(Number);
      return n >= Math.min(lo!, hi!) && n <= Math.max(lo!, hi!);
    }
    const v = Number(value);
    if (Number.isNaN(v)) return true;
    return (
      (
        { eq: n === v, ne: n !== v, gt: n > v, gte: n >= v, lt: n < v, lte: n <= v } as Record<
          string,
          boolean
        >
      )[rule.op] ?? true
    );
  }

  const d = day(raw);
  if (rule.op === "between" && Array.isArray(value)) {
    const [a, b] = [day(value[0]), day(value[1])].sort();
    return d >= a! && d <= b!;
  }
  const v = day(value);
  return ({ on: d === v, before: d < v, after: d > v } as Record<string, boolean>)[rule.op] ?? true;
}

export function filterRows<T>(
  rows: T[],
  fields: Record<string, ClientField<T>>,
  rules: FilterRule[],
  match: "and" | "or"
): T[] {
  const usable = rules.filter((r) => fields[r.field]);
  if (!usable.length) return rows;
  return rows.filter((row) =>
    match === "or"
      ? usable.some((r) => matches(row, r, fields[r.field]!))
      : usable.every((r) => matches(row, r, fields[r.field]!))
  );
}

export function sortRows<T>(rows: T[], fields: Record<string, ClientField<T>>, sort: SortRule[]): T[] {
  const usable = sort.filter((s) => fields[s.id]);
  if (!usable.length) return rows;
  return [...rows].sort((a, b) => {
    for (const s of usable) {
      const f = fields[s.id]!;
      const x = f.get(a);
      const y = f.get(b);
      if (x === null || x === undefined) {
        if (y === null || y === undefined) continue;
        return 1;
      }
      if (y === null || y === undefined) return -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  });
}
