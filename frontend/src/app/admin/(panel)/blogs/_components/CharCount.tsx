import { cn } from "@/lib/utils";

export function LabelWithCount({
  label,
  count,
  max,
  recommended,
}: {
  label: string;
  count: number;
  max: number;
  recommended?: number;
}) {
  const limit = recommended ?? max;
  return (
    <span className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span
        aria-live="polite"
        className={cn(
          "text-[11px] font-medium tabular-nums",
          count > max ? "text-danger" : count > limit ? "text-warning" : "text-fg-subtle"
        )}
      >
        {count}/{limit}
      </span>
    </span>
  );
}
