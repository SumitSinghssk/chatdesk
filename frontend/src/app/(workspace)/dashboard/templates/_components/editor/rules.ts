import type { ButtonType, TemplateButton, TemplateInput } from "../../../_lib/templatesApi";

// The same checks the API runs before submitting to Meta, so problems show while typing.

export const LIMITS = { name: 512, header: 60, body: 1024, footer: 60, button: 25, buttons: 10 };
export const BUTTON_MAX: Record<Exclude<ButtonType, "other">, number> = {
  quick_reply: 10,
  url: 2,
  phone_number: 1,
  copy_code: 1,
  otp: 1,
};

const VAR = /\{\{\s*(\w+)\s*\}\}/g;
const NAMED = /^[a-z_][a-z0-9_]*$/;

export function variables(text: string | null | undefined): string[] {
  return [...new Set([...(text ?? "").matchAll(VAR)].map((m) => m[1]))];
}

/** Numbered variables in number order ({{1}} first); named ones in order of use. */
export function ordered(names: string[]) {
  return names.length && names.every((n) => /^\d+$/.test(n)) ? [...names].sort((a, b) => +a - +b) : names;
}

/** "Order Update!" -> "order_update" */
export function cleanName(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, LIMITS.name);
}

/** Meta wants quick replies grouped together, before or after the other buttons. */
export function groupButtons(buttons: TemplateButton[]) {
  if (!buttons.length) return buttons;
  const quick = buttons.filter((b) => b.type === "quick_reply");
  const rest = buttons.filter((b) => b.type !== "quick_reply");
  return buttons[0].type === "quick_reply" ? [...quick, ...rest] : [...rest, ...quick];
}

function checkVariables(
  errors: Record<string, string>,
  field: string,
  text: string,
  fmt: string,
  label: string
) {
  const names = variables(text);
  if (!names.length) return;
  if (fmt === "positional") {
    if (names.some((n) => !/^\d+$/.test(n))) {
      errors[field] = `Use numbered variables like {{1}} in the ${label}, or switch to named variables`;
    } else if (ordered(names).some((n, i) => +n !== i + 1)) {
      errors[field] = `Number the ${label} variables in order: {{1}}, {{2}}, {{3}}…`;
    }
  } else if (names.some((n) => /^\d+$/.test(n) || !NAMED.test(n))) {
    errors[field] = "Named variables use lowercase letters and underscores, like {{first_name}}";
  }
  const t = text.trim();
  if (!errors[field] && (t.startsWith("{{") || t.endsWith("}}"))) {
    errors[field] = `The ${label} can't start or end with a variable. Add a few words before or after it.`;
  }
  if (!errors[field] && /\}\}\s*\{\{/.test(text)) {
    errors[field] = `Put some words between variables in the ${label}`;
  }
}

export function validate(form: Omit<TemplateInput, "submit">, hasSample: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name || !/^[a-z0-9_]+$/.test(form.name)) {
    errors.name = "Use lowercase letters, numbers and underscores, e.g. order_update";
  }
  if (form.category === "authentication") return errors;

  const body = form.body ?? "";
  if (!body.trim()) {
    errors.body = "Write the message body";
  } else {
    checkVariables(errors, "body", body, form.parameter_format, "body");
    const names = variables(body);
    for (const name of names) {
      if (!form.examples[name]?.trim()) errors[`examples.${name}`] = "Add a sample value";
    }
    if (names.length && body.trim().split(/\s+/).length < names.length * 3 && !errors.body) {
      errors.body = "Too many variables for such a short message. Add more words.";
    }
  }

  const h = form.header;
  if (h.format === "text") {
    const names = variables(h.text);
    if (!h.text?.trim()) errors["header.text"] = "Write the header text, or choose no header";
    else if (names.length > 1) errors["header.text"] = "The header can have only one variable";
    else if (names.length && form.parameter_format === "positional" && names[0] !== "1")
      errors["header.text"] = "Use {{1}} for the header variable";
    else if (names.length && !h.example?.trim()) errors["header.example"] = "Add a sample value";
  } else if (["image", "video", "document"].includes(h.format) && !hasSample) {
    errors.sample = `Upload a sample ${h.format === "document" ? "PDF" : h.format}`;
  }

  if (form.footer && /\{\{/.test(form.footer)) errors.footer = "The footer can't have variables";

  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  form.buttons.forEach((b, i) => {
    counts[b.type] = (counts[b.type] ?? 0) + 1;
    const key = `buttons.${i}`;
    if (b.type !== "copy_code") {
      if (!b.text.trim()) errors[`${key}.text`] = "Add the button text";
      else if (seen.has(b.text.trim().toLowerCase()))
        errors[`${key}.text`] = "Two buttons can't have the same text";
      seen.add(b.text.trim().toLowerCase());
    }
    if (b.type === "url") {
      const url = b.url ?? "";
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/.test(url.replace("{{1}}", "x"))) {
        errors[`${key}.url`] = "Enter a full link starting with https://";
      } else if (/\{\{/.test(url)) {
        if (!url.endsWith("{{1}}") || variables(url).length > 1 || (url.match(/\{\{/g) ?? []).length > 1)
          errors[`${key}.url`] = "A link can have one variable, {{1}}, at the very end";
        else if (!b.example?.trim()) errors[`${key}.example`] = "Add a sample value for the end of the link";
      }
    } else if (b.type === "phone_number") {
      if (!/^\+[1-9]\d{6,18}$/.test((b.phone_number ?? "").replace(/\s/g, "")))
        errors[`${key}.phone_number`] = "Enter the number with country code, e.g. +919876543210";
    } else if (b.type === "copy_code") {
      if (!/^[A-Za-z0-9]{1,15}$/.test(b.example ?? ""))
        errors[`${key}.example`] = "Up to 15 letters or numbers";
    }
  });
  for (const [type, n] of Object.entries(counts)) {
    const max = BUTTON_MAX[type as keyof typeof BUTTON_MAX];
    if (max && n > max) errors.buttons = `Too many ${type.replace("_", " ")} buttons (max ${max})`;
  }
  return errors;
}
