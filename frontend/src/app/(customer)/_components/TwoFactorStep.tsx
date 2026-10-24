"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import {
  CustomerApiError,
  customerApi,
  errorMessage,
  type SignInResult,
} from "@/app/(customer)/_lib/customerApi";

import { Alert, Button, Field } from "./ui";

/** The second step of signing in: the code from the authenticator app, or a recovery code. */
export function TwoFactorStep({
  token,
  onDone,
  onCancel,
}: {
  token: string;
  onDone: (data: SignInResult) => void;
  onCancel: () => void;
}) {
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await customerApi.twoFactor({
        two_factor_token: token,
        ...(recovery ? { recovery_code: value.trim() } : { code: value.replace(/\s/g, "") }),
      });
      onDone(res.data);
    } catch (err) {
      const api = err instanceof CustomerApiError ? err : null;
      setError(api?.errors.code || api?.errors.recovery_code || errorMessage(err));
      if (api?.status === 401) onCancel();
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="bg-primary-soft text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-fg font-semibold">Two-step sign-in</p>
        <p className="text-fg-subtle text-sm">
          {recovery
            ? "Enter one of the recovery codes you saved when you turned this on."
            : "Open your authenticator app and enter the 6-digit code for ChatDesk."}
        </p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field
        key={recovery ? "recovery" : "code"}
        label={recovery ? "Recovery code" : "Code"}
        name={recovery ? "recovery_code" : "code"}
        inputMode={recovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoFocus
        maxLength={recovery ? 20 : 7}
        placeholder={recovery ? "abc123-def456" : "123 456"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" full loading={busy} icon={ShieldCheck}>
        Verify and sign in
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-primary font-medium hover:underline"
          onClick={() => {
            setRecovery((r) => !r);
            setValue("");
            setError("");
          }}
        >
          {recovery ? "Use the app code instead" : "Use a recovery code"}
        </button>
        <button type="button" className="text-fg-subtle hover:text-fg" onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}
