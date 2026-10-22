import { cn, initials } from "@/lib/utils";

const COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-sky-500",
];

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const color = COLORS[(name || "?").charCodeAt(0) % COLORS.length];
  return src ? (
    <img
      src={src}
      alt={name || "Avatar"}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-lg object-cover", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white",
        color,
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}
