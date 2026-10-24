"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquareText } from "lucide-react";

import {
  CustomerApiError,
  customerApi,
  errorMessage,
  type AuthOptions,
  type OtpSent,
  type SignInResult,
} from "@/app/(customer)/_lib/customerApi";

import { Alert, Button, Field } from "@/app/(customer)/_components/ui";

export function useCountdown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until, now]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const start = (seconds: number) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  };
  return { left, start };
}

export function OtpCodeField({
  length,
  value,
  onChange,
  error,
}: {
  length: number;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <Field
      label="Verification code"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d*"
      maxLength={length}
      placeholder={"•".repeat(length)}
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
      error={error}
      className="[&_input]:text-center [&_input]:font-mono [&_input]:text-xl [&_input]:tracking-[0.5em]"
    />
  );
}

export function OtpForm({
  options,
  onDone,
}: {
  options: AuthOptions;
  onDone: (data?: SignInResult) => void;
}) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const timer = useCountdown();

  const fail = (err: unknown) => {
    const api = err instanceof CustomerApiError ? err : null;
    setErrors(api?.errors ?? {});
    setFormError(api && Object.keys(api.errors).length ? "" : errorMessage(err));
    const wait = (api?.data as { resend_in?: number } | null)?.resend_in;
    if (wait) timer.start(wait);
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (phone.replace(/\D/g, "").length < 6) {
      setErrors({ phone: "Enter your mobile number" });
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      const res = await customerApi.sendOtp(phone);
      setSent(res.data);
      setCode("");
      timer.start(res.data.resend_in);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sent) return;
    if (code.length !== sent.length) {
      setErrors({ code: `Enter the ${sent.length}-digit code` });
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      const res = await customerApi.verifyOtp({ phone: sent.phone, code, name: name.trim() || undefined });
      onDone(res.data);
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <form onSubmit={send} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Field
          label="Mobile number"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={options.default_country_code === "91" ? "98765 43210" : "Mobile number"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          hint={`Numbers without a + code are treated as +${options.default_country_code}.`}
        />
        <Button type="submit" full loading={busy} icon={MessageSquareText}>
          Send code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <p className="text-fg-muted text-sm">
        We sent a {sent.length}-digit code to <span className="text-fg font-semibold">{sent.phone}</span>.
      </p>
      {formError && <Alert>{formError}</Alert>}
      <OtpCodeField length={sent.length} value={code} onChange={setCode} error={errors.code} />
      {sent.is_new && (
        <Field
          label="Your name"
          name="name"
          autoComplete="name"
          placeholder="So we know what to call you"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
      )}
      <Button type="submit" full loading={busy}>
        {sent.is_new ? "Create account" : "Verify and sign in"}
      </Button>
      <div className="flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          className="text-fg-subtle hover:text-fg inline-flex items-center gap-1"
          onClick={() => {
            setSent(null);
            setErrors({});
            setFormError("");
          }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Change number
        </button>
        <button
          type="button"
          className="text-primary disabled:text-fg-faint font-medium"
          disabled={timer.left > 0 || busy}
          onClick={() => send()}
        >
          {timer.left > 0 ? `Resend in ${timer.left}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
