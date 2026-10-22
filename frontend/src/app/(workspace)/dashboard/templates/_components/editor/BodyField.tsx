"use client";

import { useRef, useState } from "react";
import { Bold, Braces, Code, Italic, Plus, Strikethrough } from "lucide-react";

import { Button, Field, Input, controlClasses } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import { EmojiPicker } from "../../../inbox/_components/EmojiPicker";
import { Tooltip } from "../../../_components/Tooltip";
import type { ParameterFormat } from "../../../_lib/templatesApi";
import { Counter } from "./parts";
import { LIMITS, ordered, variables } from "./rules";

const STYLES = [
  { icon: Bold, label: "Bold", mark: "*" },
  { icon: Italic, label: "Italic", mark: "_" },
  { icon: Strikethrough, label: "Strikethrough", mark: "~" },
  { icon: Code, label: "Monospace", mark: "```" },
];

/** Next free variable: {{3}} after {{1}} {{2}}, or a name such as {{customer_name}}. */
function nextVariable(text: string, format: ParameterFormat, name: string) {
  if (format === "named") return `{{${name}}}`;
  const used = variables(text)
    .filter((n) => /^\d+$/.test(n))
    .map(Number);
  return `{{${(used.length ? Math.max(...used) : 0) + 1}}}`;
}

export function BodyField({
  value,
  onChange,
  examples,
  onExamples,
  format,
  errors,
}: {
  value: string;
  onChange: (value: string) => void;
  examples: Record<string, string>;
  onExamples: (examples: Record<string, string>) => void;
  format: ParameterFormat;
  errors: Record<string, string>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [naming, setNaming] = useState<string | null>(null);

  /** Replaces the selection with `before + selection + after` and keeps the cursor sensible. */
  const edit = (before: string, after = "") => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + before.length + selected.length + (selected ? after.length : 0);
      el?.setSelectionRange(
        selected ? caret : start + before.length,
        selected ? caret : start + before.length
      );
    });
  };

  const addVariable = () => {
    if (format === "named") {
      setNaming("");
      return;
    }
    edit(nextVariable(value, format, ""));
  };
  const addNamed = () => {
    const name = (naming ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!name) return;
    setNaming(null);
    edit(nextVariable(value, "named", /^[a-z_]/.test(name) ? name : `v_${name}`));
  };

  const names = ordered(variables(value));

  return (
    <div className="space-y-3">
      <Field
        label="Message"
        htmlFor="template-body"
        required
        error={errors.body}
        hint={
          <span className="flex justify-between gap-3">
            <span>Use *bold*, _italic_, ~strike~ and variables for details that change per customer.</span>
            <Counter value={value} max={LIMITS.body} />
          </span>
        }
      >
        <div
          className={cn(
            controlClasses(!!errors.body),
            "focus-within:border-primary focus-within:ring-primary/15 p-0 focus-within:ring-3"
          )}
        >
          <div className="border-line flex items-center gap-0.5 border-b px-1.5 py-1">
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              {STYLES.map(({ icon: Icon, label, mark }) => (
                <Tooltip key={label} label={label}>
                  <button
                    type="button"
                    aria-label={label}
                    onClick={() => edit(mark, mark)}
                    className="text-fg-subtle hover:bg-hover hover:text-fg flex h-8 w-8 items-center justify-center rounded-md transition"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </Tooltip>
              ))}
              <EmojiPicker placement="bottom" onPick={(emoji) => edit(emoji)} />
            </div>
            <Button size="sm" variant="ghost" leftIcon={Braces} onClick={addVariable} className="shrink-0">
              Add variable
            </Button>
          </div>
          <textarea
            ref={ref}
            id="template-body"
            name="body"
            rows={7}
            maxLength={LIMITS.body + 50}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              format === "named"
                ? "Hi {{first_name}}, your order {{order_id}} has shipped and will reach you by tomorrow."
                : "Hi {{1}}, your order {{2}} has shipped and will reach you by tomorrow."
            }
            aria-invalid={!!errors.body}
            className="placeholder:text-fg-faint block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none"
          />
        </div>
      </Field>

      {naming !== null && (
        <div className="flex items-end gap-2">
          <Input
            autoFocus
            label="Variable name"
            name="variable_name"
            placeholder="first_name"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNamed();
              }
              if (e.key === "Escape") setNaming(null);
            }}
            wrapperClassName="flex-1"
          />
          <Button leftIcon={Plus} onClick={addNamed} disabled={!naming?.trim()}>
            Add
          </Button>
          <Button variant="ghost" onClick={() => setNaming(null)}>
            Cancel
          </Button>
        </div>
      )}

      {names.length > 0 && (
        <div className="bg-page border-line rounded-lg border p-3">
          <p className="text-fg mb-0.5 text-sm font-medium">Sample values</p>
          <p className="text-fg-subtle mb-3 text-xs">
            Meta reviews the template with these. Use realistic examples, not real customer data.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {names.map((name) => (
              <Input
                key={name}
                name={`example_${name}`}
                label={<span className="font-mono text-xs">{`{{${name}}}`}</span>}
                placeholder={name === "1" || name.includes("name") ? "Asha" : "Sample value"}
                value={examples[name] ?? ""}
                error={errors[`examples.${name}`]}
                maxLength={200}
                onChange={(e) => onExamples({ ...examples, [name]: e.target.value })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
