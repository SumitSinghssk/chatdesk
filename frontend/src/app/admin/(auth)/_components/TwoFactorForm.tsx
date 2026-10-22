"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";

import { Button, ErrorBanner, Input } from "@/app/admin/_components/ui/index";
import { twoFactorChallenge } from "@/app/admin/_lib/api/authApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";

import { useAuthStore } from "@/app/admin/_store/authStore";

import { useCompleteLogin } from "./useLoginRedirect";

import { ADMIN_ROUTES } from "@/config/routes";
export default function TwoFactorForm() {
  const router = useRouter();
  const completeLogin = useCompleteLogin();
  const pending = useAuthStore((s) => s.pendingTwoFactor);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!pending) router.replace(ADMIN_ROUTES.LOGIN());
  }, [pending, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await twoFactorChallenge({
        two_factor_token: pending.token,
        ...(useRecovery ? { recovery_code: code.trim() } : { code: code.replace(/\s/g, "") }),
      });
      completeLogin(tokens);
    } catch (err) {
      setError(apiErrorMessage(err, "Verification failed"));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        label={useRecovery ? "Recovery code" : "Authentication code"}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={useRecovery ? "abc123-def456" : "123 456"}
        inputMode={useRecovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoFocus
        leftIcon={useRecovery ? KeyRound : ShieldCheck}
        hint={
          useRecovery
            ? "Each recovery code works once."
            : "Open your authenticator app and enter the 6-digit code."
        }
      />
      {error && <ErrorBanner message={error} />}
      <Button type="submit" size="lg" fullWidth loading={submitting} disabled={!code.trim()}>
        Verify and sign in
      </Button>
      <div className="text-center text-sm">
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setUseRecovery((v) => !v);
            setCode("");
            setError(null);
          }}
        >
          {useRecovery ? "Use authenticator code" : "Use a recovery code"}
        </Button>
      </div>
    </form>
  );
}
