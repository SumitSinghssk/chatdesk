"use client";

import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Calendar, formatYmd, pad, todayYmd } from "./Calendar";
import { Field, controlClasses } from "./Field";
import { adminPortalTarget } from "./portal";
import { formatTime, TimeFields } from "./TimeFields";
import { usePopover } from "./usePopover";

interface BaseProps {
  label?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  clearable?: boolean;
  id?: string;
  name?: string;
  wrapperClassName?: string;
  className?: string;
  size?: "sm" | "md";
}

export function PickerTrigger({
  id,
  icon: Icon,
  text,
  placeholder,
  open,
  error,
  disabled,
  onOpen,
  onClear,
  size = "md",
  className,
  triggerRef,
  "aria-label": ariaLabel,
}: {
  id: string;
  icon: typeof CalendarDays;
  text: string;
  placeholder: string;
  open: boolean;
  error?: string;
  disabled?: boolean;
  onOpen: () => void;
  onClear?: () => void;
  size?: "sm" | "md";
  className?: string;
  triggerRef: (el: HTMLButtonElement | null) => void;
  "aria-label"?: string;
}) {
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          controlClasses(!!error),
          "flex items-center gap-2 pl-3 text-left",
          onClear && text ? "pr-8" : "pr-3",
          size === "sm" ? "h-9 text-sm" : "py-2",
          className
        )}
      >
        <Icon className="text-fg-faint h-4 w-4 shrink-0" />
        <span className={cn("tabular min-w-0 flex-1 truncate", !text && "text-fg-faint")}>
          {text || placeholder}
        </span>
      </button>
      {onClear && text && !disabled && (
        <button
          type="button"
          aria-label="Clear"
          onClick={onClear}
          className="text-fg-faint hover:bg-hover hover:text-fg absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export const footerButton = {
  primary: "h-7 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover",
  link: "h-7 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary-soft",
  muted: "h-7 rounded-md px-2 text-xs text-fg-subtle hover:bg-hover",
};

export interface DatePickerProps extends BaseProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  withTime?: boolean;
  min?: string;
  max?: string;
  use24Hour?: boolean;
  minuteStep?: number;
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onChange,
  withTime = false,
  min,
  max,
  use24Hour = false,
  minuteStep = 1,
  label,
  description,
  hint,
  error,
  required,
  disabled,
  placeholder,
  clearable = true,
  id,
  name,
  wrapperClassName,
  className,
  size,
  ...rest
}: DatePickerProps) {
  const autoId = useId();
  const triggerId = id || name || `date-${autoId}`;
  const {
    setOpen: setPopoverOpen,
    open: popoverOpen,
    setTrigger,
    setPanel,
    style: popoverStyle,
  } = usePopover({ matchWidth: false, maxHeight: 520 });
  const current = value ?? "";
  const datePart = current.slice(0, 10);
  const timePart = current.slice(11, 16);
  const [draft, setDraft] = useState({ date: "", time: "" });

  const text = datePart
    ? `${formatYmd(datePart)}${withTime && timePart ? `, ${formatTime(timePart, use24Hour)}` : ""}`
    : "";

  const openPanel = () => {
    if (disabled) return;
    setDraft({ date: datePart, time: timePart || "09:00" });
    setPopoverOpen(!popoverOpen);
  };

  const commit = (date: string, time: string) => {
    onChange(date ? (withTime ? `${date}T${time || "00:00"}` : date) : "");
  };

  const pickDate = (ymd: string) => {
    if (withTime) setDraft((d) => ({ ...d, date: ymd }));
    else {
      commit(ymd, "");
      setPopoverOpen(false);
    }
  };

  const now = new Date();

  return (
    <Field
      label={label}
      htmlFor={triggerId}
      required={required}
      description={description}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      {name && <input type="hidden" name={name} value={current} />}
      <PickerTrigger
        id={triggerId}
        icon={withTime ? Clock : CalendarDays}
        text={text}
        placeholder={placeholder ?? (withTime ? "Pick a date and time" : "Pick a date")}
        open={popoverOpen}
        error={error}
        disabled={disabled}
        size={size}
        className={className}
        onOpen={openPanel}
        onClear={clearable ? () => onChange("") : undefined}
        triggerRef={setTrigger}
        aria-label={rest["aria-label"]}
      />

      {popoverOpen &&
        createPortal(
          <div
            ref={setPanel}
            style={popoverStyle}
            role="dialog"
            aria-label={withTime ? "Choose date and time" : "Choose date"}
            className="popover-panel border-line bg-surface z-[120] overflow-y-auto rounded-xl border p-3 shadow-lg"
          >
            <Calendar selected={withTime ? draft.date : datePart} min={min} max={max} onPick={pickDate} />
            {withTime && (
              <div className="border-line mt-3 border-t pt-3">
                <TimeFields
                  value={draft.time}
                  onChange={(time) => setDraft((d) => ({ ...d, time }))}
                  use24Hour={use24Hour}
                  minuteStep={minuteStep}
                />
              </div>
            )}
            <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
              <button
                type="button"
                className={footerButton.link}
                onClick={() => {
                  if (withTime)
                    setDraft({ date: todayYmd(), time: `${pad(now.getHours())}:${pad(now.getMinutes())}` });
                  else pickDate(todayYmd());
                }}
              >
                {withTime ? "Now" : "Today"}
              </button>
              <span className="flex gap-1">
                {clearable && (
                  <button
                    type="button"
                    className={footerButton.muted}
                    onClick={() => {
                      onChange("");
                      setPopoverOpen(false);
                    }}
                  >
                    Clear
                  </button>
                )}
                {withTime && (
                  <button
                    type="button"
                    className={footerButton.primary}
                    disabled={!draft.date}
                    onClick={() => {
                      commit(draft.date, draft.time);
                      setPopoverOpen(false);
                    }}
                  >
                    Done
                  </button>
                )}
              </span>
            </div>
          </div>,
          adminPortalTarget()
        )}
    </Field>
  );
}
