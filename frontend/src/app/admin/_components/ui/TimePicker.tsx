"use client";

import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

import { pad } from "./Calendar";
import { PickerTrigger, footerButton } from "./DatePicker";
import { Field } from "./Field";
import { adminPortalTarget } from "./portal";
import { formatTime, TimeFields } from "./TimeFields";
import { usePopover } from "./usePopover";

export interface TimePickerProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  label?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  use24Hour?: boolean;
  minuteStep?: number;
  clearable?: boolean;
  id?: string;
  name?: string;
  wrapperClassName?: string;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}

export function TimePicker({
  value,
  onChange,
  label,
  description,
  hint,
  error,
  required,
  disabled,
  placeholder = "Pick a time",
  use24Hour = false,
  minuteStep = 1,
  clearable = false,
  id,
  name,
  wrapperClassName,
  className,
  size,
  ...rest
}: TimePickerProps) {
  const autoId = useId();
  const triggerId = id || name || `time-${autoId}`;
  const {
    setOpen: setPopoverOpen,
    open: popoverOpen,
    setTrigger,
    setPanel,
    style: popoverStyle,
  } = usePopover({ matchWidth: false });
  const current = value ?? "";
  const [draft, setDraft] = useState("");

  const openPanel = () => {
    if (disabled) return;
    setDraft(current || "09:00");
    setPopoverOpen(!popoverOpen);
  };

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
        icon={Clock}
        text={formatTime(current, use24Hour)}
        placeholder={placeholder}
        open={popoverOpen}
        error={error}
        disabled={disabled}
        size={size}
        className={className}
        aria-label={rest["aria-label"]}
        onOpen={openPanel}
        onClear={clearable ? () => onChange("") : undefined}
        triggerRef={setTrigger}
      />
      {popoverOpen &&
        createPortal(
          <div
            ref={setPanel}
            style={popoverStyle}
            role="dialog"
            aria-label="Choose time"
            className="popover-panel border-line bg-surface z-[120] rounded-xl border p-3 shadow-lg"
          >
            <TimeFields value={draft} onChange={setDraft} use24Hour={use24Hour} minuteStep={minuteStep} />
            <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
              <button
                type="button"
                className={footerButton.link}
                onClick={() => {
                  const now = new Date();
                  setDraft(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
                }}
              >
                Now
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
                <button
                  type="button"
                  className={footerButton.primary}
                  onClick={() => {
                    onChange(draft);
                    setPopoverOpen(false);
                  }}
                >
                  Done
                </button>
              </span>
            </div>
          </div>,
          adminPortalTarget()
        )}
    </Field>
  );
}
