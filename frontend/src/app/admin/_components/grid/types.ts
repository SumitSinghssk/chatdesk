import type { ReactNode } from "react";

export type GridFieldType = "text" | "number" | "date" | "enum" | "bool";

export type FilterOp =
  | "contains"
  | "not_contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "on"
  | "before"
  | "after"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty"
  | "is_true"
  | "is_false";

export type FilterValue = string | string[] | null;

export interface FilterRule {
  id: string;
  field: string;
  op: FilterOp;
  value: FilterValue;
}

export interface SortRule {
  id: string;
  desc: boolean;
}

export type Density = "compact" | "standard" | "comfortable";

export type GridView = "table" | "list" | "cards";

export interface RowSlots {
  checkbox: ReactNode | null;
  selected: boolean;
}

export interface GridColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  type?: GridFieldType;
  options?: { value: string; label: string }[];
  sortable?: boolean;
  size?: number;
  minSize?: number;
  align?: "left" | "right" | "center";
  defaultHidden?: boolean;
  alwaysVisible?: boolean;
}
