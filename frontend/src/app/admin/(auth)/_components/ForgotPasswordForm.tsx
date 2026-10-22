"use client";

import { useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";

import { Button, ErrorBanner, Input } from "@/app/admin/_components/ui/index";
import { forgotPassword } from "@/app/admin/_lib/api/authApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";

import { ADMIN_ROUTES } from "@/config/routes";
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setSent((await forgotPassword(email.trim())) ?? "Check your inbox for a reset link.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {sent}
        </div>
        <Button href={ADMIN_ROUTES.LOGIN()} variant="secondary" fullWidth>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        label="Email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        leftIcon={Mail}
        autoFocus
      />
      {error && <ErrorBanner message={error} />}
      <Button type="submit" size="lg" fullWidth loading={submitting}>
        Email me a reset link
      </Button>
    </form>
  );
}
