"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { BROWSER_API_BASE_URL } from "@/config/site";
import { WEBSITE_ENDPOINTS } from "@/config/endpoints/website";
import { cn } from "@/lib/utils";

type Errors = Partial<Record<"name" | "email" | "phone" | "message" | "form", string>>;

const input =
  "w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-base text-fg shadow-xs transition placeholder:text-fg-faint focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none";

export function ContactForm() {
  const pathname = usePathname();
  const startedAt = useRef(0);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const next: Errors = {};
    if (data.name.trim().length < 2) next.name = "Please enter your name";
    if (!data.email.trim() && !data.phone.trim()) next.email = "Please enter an email or phone number";
    if (data.message.trim().length < 5) next.message = "Please write a short message";
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus("sending");
    try {
      const res = await fetch(`${BROWSER_API_BASE_URL}${WEBSITE_ENDPOINTS.ENQUIRIES}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          ...data,
          source_url: window.location.origin + pathname,
          started_at: startedAt.current,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldErrors = Object.fromEntries(
          Object.entries((json.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0]])
        );
        setErrors({ ...fieldErrors, form: json.message ?? "Something went wrong. Please try again." });
        setStatus("idle");
        return;
      }
      setMessage(json.message ?? "Thanks! We'll get back to you soon.");
      setStatus("sent");
    } catch {
      setErrors({ form: "Can't reach the server. Please try again in a moment." });
      setStatus("idle");
    }
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-14 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <p className="text-fg mt-4 text-xl font-semibold">Message sent</p>
        <p className="text-fg-subtle mt-1">{message}</p>
      </div>
    );
  }

  const field = (name: keyof Errors, label: string, el: React.ReactNode, required = false) => (
    <div>
      <label htmlFor={name} className="text-fg-muted mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {el}
      {errors[name] && <p className="mt-1.5 text-sm text-red-600">{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "name",
          "Full name",
          <input
            id="name"
            name="name"
            autoComplete="name"
            className={cn(input, errors.name && "border-red-300")}
          />,
          true
        )}
        {field(
          "email",
          "Email",
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className={cn(input, errors.email && "border-red-300")}
          />
        )}
        {field(
          "phone",
          "Phone",
          <input id="phone" name="phone" type="tel" autoComplete="tel" className={input} />
        )}
        <div>
          <label htmlFor="company" className="text-fg-muted mb-1.5 block text-sm font-medium">
            Company
          </label>
          <input id="company" name="company" autoComplete="organization" className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="subject" className="text-fg-muted mb-1.5 block text-sm font-medium">
          Subject
        </label>
        <input id="subject" name="subject" className={input} />
      </div>
      {field(
        "message",
        "Message",
        <textarea
          id="message"
          name="message"
          rows={5}
          className={cn(input, errors.message && "border-red-300")}
        />,
        true
      )}

      {errors.form && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-primary hover:bg-primary-hover inline-flex h-11 items-center gap-2 rounded-lg px-6 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
      >
        {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {status === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
