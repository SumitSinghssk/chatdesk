import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "subtle"
  | "ghost"
  | "outline"
  | "success"
  | "warning"
  | "danger"
  | "danger-outline"
  | "dark"
  | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition select-none focus:outline-none focus-visible:ring-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none";

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-[11px]",
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4.5 text-sm",
};
const ICON_ONLY: Record<ButtonSize, string> = {
  xs: "h-6 w-6 text-[11px]",
  sm: "h-7.5 w-7.5 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-10 w-10 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-fg shadow-xs inset-ring inset-ring-black/10 hover:bg-primary-hover focus-visible:ring-primary/30 dark:inset-ring-white/10",
  secondary:
    "border border-line bg-surface text-fg-muted shadow-xs hover:border-line-strong hover:bg-page hover:text-fg focus-visible:ring-primary/20",
  subtle: "bg-hover text-fg-muted hover:bg-line hover:text-fg focus-visible:ring-primary/20",
  ghost: "bg-transparent text-fg-muted hover:bg-hover hover:text-fg focus-visible:ring-primary/20",
  outline:
    "border border-line-strong bg-transparent text-fg-muted hover:bg-hover focus-visible:ring-primary/20",
  success: "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 focus-visible:ring-emerald-500/30",
  warning: "bg-amber-400 text-slate-900 shadow-xs hover:bg-amber-500 focus-visible:ring-amber-400/40",
  danger: "bg-red-600 text-white shadow-xs hover:bg-red-700 focus-visible:ring-red-500/30",
  "danger-outline":
    "border border-red-200 bg-surface text-red-600 shadow-xs hover:bg-red-50 focus-visible:ring-red-500/30 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10",
  dark: "bg-slate-900 text-white shadow-xs hover:bg-slate-800 focus-visible:ring-slate-500/30 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200",
  link: "h-auto! bg-transparent px-0! text-primary hover:underline focus-visible:ring-primary/30",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  opts: { fullWidth?: boolean; iconOnly?: boolean; className?: string } = {}
) {
  return cn(
    BASE,
    opts.iconOnly ? ICON_ONLY[size] : SIZES[size],
    VARIANTS[variant],
    opts.fullWidth && "w-full",
    opts.className
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
  href?: string;
  target?: string;
  children?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    loading = false,
    fullWidth,
    iconOnly,
    href,
    target,
    className,
    children,
    type = "button",
    disabled,
    ...rest
  },
  ref
) {
  const classes = buttonClasses(variant, size, { fullWidth, iconOnly, className });
  const content = (
    <>
      {loading ? <Spinner /> : LeftIcon && <LeftIcon className="h-4 w-4 shrink-0" />}
      {children}
      {RightIcon && !loading && <RightIcon className="h-4 w-4 shrink-0" />}
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        href={href}
        target={target}
        className={classes}
        aria-label={rest["aria-label"]}
        title={rest.title}
      >
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
});

export default Button;
