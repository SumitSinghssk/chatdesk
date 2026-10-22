"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  MessageCircleOff,
  Phone,
  Plus,
  Reply,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Button, Dropdown, ErrorText, Input, Select } from "@/app/admin/_components/ui/index";

import { Tooltip } from "../../../_components/Tooltip";
import type { ButtonType, TemplateButton } from "../../../_lib/templatesApi";
import { Counter } from "./parts";
import { BUTTON_MAX, LIMITS } from "./rules";

const KINDS: Record<string, { label: string; icon: LucideIcon }> = {
  quick_reply: { label: "Quick reply", icon: Reply },
  url: { label: "Visit website", icon: ExternalLink },
  phone_number: { label: "Call phone number", icon: Phone },
  copy_code: { label: "Copy offer code", icon: Copy },
};

const blank = (type: ButtonType, text = ""): TemplateButton => ({
  type,
  text: type === "copy_code" ? "Copy offer code" : text,
  url: type === "url" ? "https://" : null,
  phone_number: type === "phone_number" ? "+91" : null,
  example: null,
});

export function ButtonsField({
  buttons,
  onChange,
  marketing,
  errors,
}: {
  buttons: TemplateButton[];
  onChange: (buttons: TemplateButton[]) => void;
  marketing: boolean;
  errors: Record<string, string>;
}) {
  const count = (t: ButtonType) => buttons.filter((b) => b.type === t).length;
  const full = buttons.length >= LIMITS.buttons;
  const can = (t: Exclude<ButtonType, "other" | "otp">) => !full && count(t) < BUTTON_MAX[t];
  const add = (b: TemplateButton) => onChange([...buttons, b]);
  const update = (i: number, patch: Partial<TemplateButton>) =>
    onChange(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, by: number) => {
    const next = [...buttons];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  const hasOptOut = buttons.some((b) => b.type === "quick_reply" && /stop|unsubscribe/i.test(b.text));

  return (
    <div className="space-y-3">
      {buttons.map((b, i) => {
        const kind = KINDS[b.type] ?? { label: b.type, icon: Reply };
        const Icon = kind.icon;
        const dynamic = b.type === "url" && /\{\{1\}\}$/.test(b.url ?? "");
        return (
          <div key={i} className="border-line bg-page rounded-lg border p-3" data-testid="template-button">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="bg-primary-soft text-primary flex h-7 w-7 items-center justify-center rounded-md">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-fg flex-1 text-sm font-medium">{kind.label}</span>
              <Tooltip label="Move up">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={ArrowUp}
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
              </Tooltip>
              <Tooltip label="Move down">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={ArrowDown}
                  aria-label="Move down"
                  disabled={i === buttons.length - 1}
                  onClick={() => move(i, 1)}
                />
              </Tooltip>
              <Tooltip label="Remove button" align="end">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Trash2}
                  aria-label={`Remove button ${i + 1}`}
                  onClick={() => onChange(buttons.filter((_, j) => j !== i))}
                  className="hover:text-danger"
                />
              </Tooltip>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {b.type !== "copy_code" && (
                <Input
                  name={`button_${i}_text`}
                  label="Button text"
                  value={b.text}
                  maxLength={LIMITS.button}
                  error={errors[`buttons.${i}.text`]}
                  onChange={(e) => update(i, { text: e.target.value })}
                  hint={<Counter value={b.text} max={LIMITS.button} />}
                  wrapperClassName={b.type === "quick_reply" ? "sm:col-span-2" : undefined}
                />
              )}
              {b.type === "url" && (
                <>
                  <Select
                    label="Link type"
                    name={`button_${i}_kind`}
                    value={dynamic ? "dynamic" : "static"}
                    options={[
                      { value: "static", label: "Static: same link for everyone" },
                      { value: "dynamic", label: "Dynamic: ends with a variable" },
                    ]}
                    onChange={(v) => {
                      const base = (b.url ?? "").replace(/\{\{1\}\}$/, "");
                      update(
                        i,
                        v === "dynamic"
                          ? { url: `${base.replace(/\/?$/, "/")}{{1}}` }
                          : { url: base, example: null }
                      );
                    }}
                  />
                  <Input
                    name={`button_${i}_url`}
                    label="Website link"
                    value={b.url ?? ""}
                    placeholder={dynamic ? "https://example.com/orders/{{1}}" : "https://example.com"}
                    error={errors[`buttons.${i}.url`]}
                    onChange={(e) => update(i, { url: e.target.value })}
                    wrapperClassName="sm:col-span-2"
                    hint={
                      dynamic
                        ? "The {{1}} at the end is filled in per customer, e.g. an order number."
                        : undefined
                    }
                  />
                  {dynamic && (
                    <Input
                      name={`button_${i}_example`}
                      label="Sample for {{1}}"
                      placeholder="1042"
                      value={b.example ?? ""}
                      error={errors[`buttons.${i}.example`]}
                      onChange={(e) => update(i, { example: e.target.value })}
                      wrapperClassName="sm:col-span-2"
                    />
                  )}
                </>
              )}
              {b.type === "phone_number" && (
                <Input
                  name={`button_${i}_phone`}
                  label="Phone number"
                  type="tel"
                  value={b.phone_number ?? ""}
                  placeholder="+919876543210"
                  error={errors[`buttons.${i}.phone_number`]}
                  onChange={(e) => update(i, { phone_number: e.target.value })}
                />
              )}
              {b.type === "copy_code" && (
                <Input
                  name={`button_${i}_code`}
                  label="Sample offer code"
                  value={b.example ?? ""}
                  placeholder="WELCOME10"
                  maxLength={15}
                  error={errors[`buttons.${i}.example`]}
                  onChange={(e) => update(i, { example: e.target.value.replace(/[^A-Za-z0-9]/g, "") })}
                  hint="Up to 15 letters or numbers. You set the real code when sending."
                  wrapperClassName="sm:col-span-2"
                />
              )}
            </div>
          </div>
        );
      })}

      {errors.buttons && <ErrorText message={errors.buttons} />}

      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          align="left"
          width="w-60"
          trigger={() => (
            <Button variant="secondary" leftIcon={Plus} disabled={full}>
              Add button
            </Button>
          )}
          items={[
            {
              label: "Quick reply",
              icon: Reply,
              onClick: () => add(blank("quick_reply")),
              disabled: !can("quick_reply"),
            },
            {
              label: "Marketing opt-out",
              icon: MessageCircleOff,
              onClick: () => add(blank("quick_reply", "Stop promotions")),
              disabled: !can("quick_reply") || hasOptOut,
              hidden: !marketing,
            },
            "divider",
            {
              label: "Visit website",
              icon: ExternalLink,
              onClick: () => add(blank("url")),
              disabled: !can("url"),
            },
            {
              label: "Call phone number",
              icon: Phone,
              onClick: () => add(blank("phone_number")),
              disabled: !can("phone_number"),
            },
            {
              label: "Copy offer code",
              icon: Copy,
              onClick: () => add(blank("copy_code")),
              disabled: !can("copy_code") || !marketing,
              hidden: !marketing,
            },
          ]}
        />
        <span className="text-fg-faint text-xs">
          {buttons.length}/{LIMITS.buttons} · more than 3 buttons show as a list in WhatsApp
        </span>
      </div>
    </div>
  );
}
