"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";

import { Badge, Button, Card, CardBody, CardHeader, Input, Skeleton } from "@/app/admin/_components/ui/index";
import { fetchMe } from "@/app/admin/_lib/api/authApi";
import { profileApi, type TwoFactorSetup } from "@/app/admin/_lib/api/profileApi";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { applyServerErrors } from "@/app/admin/_lib/form";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { PasswordPromptModal } from "./PasswordPromptModal";
import { RecoveryCodes } from "./RecoveryCodes";

import { QK } from "@/config/query-keys";
const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    password: z.string().min(1, "Enter a new password").max(72),
    password_confirmation: z.string(),
  })
  .refine((v) => v.password === v.password_confirmation, {
    path: ["password_confirmation"],
    message: "Passwords don't match",
  });
type PasswordValues = z.infer<typeof passwordSchema>;

function ChangePasswordCard() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const queryClient = useQueryClient();
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", password: "", password_confirmation: "" },
  });
  const { register, handleSubmit, reset, formState, setError } = form;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await profileApi.changePassword(values);
      setAccessToken(res.data.access_token);
      reset();
      toast.success(res.message ?? "Password changed");
      queryClient.invalidateQueries({ queryKey: [QK.PROFILE, "sessions"] });
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't change password");
    }
  });

  return (
    <Card>
      <CardHeader
        title="Change password"
        description="Changing your password signs you out of every other device."
      />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="space-y-4">
          <Input
            type="password"
            label="Current password"
            autoComplete="current-password"
            required
            error={formState.errors.current_password?.message}
            {...register("current_password")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="password"
              label="New password"
              autoComplete="new-password"
              required
              error={formState.errors.password?.message}
              {...register("password")}
            />
            <Input
              type="password"
              label="Confirm new password"
              autoComplete="new-password"
              required
              error={formState.errors.password_confirmation?.message}
              {...register("password_confirmation")}
            />
          </div>
        </CardBody>
        <div className="border-line flex justify-end border-t px-4 py-3">
          <Button type="submit" loading={formState.isSubmitting}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TwoFactorCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: [QK.PROFILE, "two-factor"], queryFn: profileApi.twoFactor });

  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState<"regenerate" | "disable" | null>(null);

  const syncUser = async () => {
    await queryClient.invalidateQueries({ queryKey: [QK.PROFILE, "two-factor"] });
    try {
      setUser(await fetchMe());
    } catch {}
  };

  const start = async () => {
    setStarting(true);
    try {
      const res = await profileApi.twoFactorSetup();
      setSetup(res.data);
      setCode("");
      setCodeError(undefined);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't start two-factor setup"));
    } finally {
      setStarting(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\s+/g, "");
    if (clean.length < 6) {
      setCodeError("Enter the 6-digit code from your app");
      return;
    }
    setConfirming(true);
    try {
      const res = await profileApi.twoFactorConfirm(clean);
      setSetup(null);
      setCodes(res.data.recovery_codes);
      toast.success(res.message ?? "Two-factor sign-in enabled");
      await syncUser();
    } catch (err) {
      setCodeError(apiFieldErrors(err).code ?? apiErrorMessage(err, "That code didn't work"));
    } finally {
      setConfirming(false);
    }
  };

  const onPassword = async (password: string) => {
    if (prompt === "regenerate") {
      const res = await profileApi.regenerateRecoveryCodes(password);
      setCodes(res.data.recovery_codes);
      toast.success(res.message ?? "New recovery codes generated");
    } else {
      const res = await profileApi.disableTwoFactor(password);
      setCodes(null);
      toast.success(res.message ?? "Two-factor sign-in disabled");
    }
    setPrompt(null);
    await syncUser();
  };

  const s = status.data;
  const enabled = s?.enabled ?? user?.two_factor_enabled ?? false;
  const required = !!(user?.two_factor_required || s?.required_by_role);

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        description="Require a code from an authenticator app when you sign in."
        actions={
          status.isLoading ? (
            <Skeleton className="h-5 w-16 rounded-full" />
          ) : enabled ? (
            <Badge tone="green" dot>
              Enabled
            </Badge>
          ) : (
            <Badge tone="default" dot>
              Off
            </Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

        {!enabled && !setup && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-fg-muted flex-1 text-sm">
              Protect your account with an app such as Google Authenticator, Microsoft Authenticator or
              1Password.
            </p>
            <Button leftIcon={ShieldCheck} loading={starting} onClick={start}>
              Enable
            </Button>
          </div>
        )}

        {!enabled && setup && (
          <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
            <div
              className="mx-auto h-48 w-48 rounded-lg bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
              role="img"
              aria-label="QR code for your authenticator app"
              dangerouslySetInnerHTML={{ __html: setup.qr_svg }}
            />
            <form onSubmit={confirm} className="space-y-3" noValidate>
              <ol className="text-fg-muted list-decimal space-y-1 pl-4 text-sm">
                <li>Scan the QR code with your authenticator app.</li>
                <li>Or enter this key manually:</li>
              </ol>
              <code className="bg-page text-fg block rounded-lg px-3 py-2 font-mono text-sm tracking-wider break-all select-all">
                {setup.secret}
              </code>
              <Input
                id="two-factor-code"
                label="Verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={10}
                value={code}
                error={codeError}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(undefined);
                }}
                wrapperClassName="max-w-xs"
              />
              <div className="flex gap-2">
                <Button type="submit" loading={confirming}>
                  Confirm & enable
                </Button>
                <Button variant="ghost" onClick={() => setSetup(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {enabled && (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fg-subtle text-xs">Enabled on</dt>
                <dd className="text-fg">{formatDate(s?.confirmed_at)}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle text-xs">Recovery codes left</dt>
                <dd className={s && s.recovery_codes_left <= 2 ? "text-warning font-semibold" : "text-fg"}>
                  {s?.recovery_codes_left ?? "—"}
                </dd>
              </div>
            </dl>
            <div className="border-line flex flex-wrap gap-2 border-t pt-4">
              <Button variant="secondary" leftIcon={RefreshCw} onClick={() => setPrompt("regenerate")}>
                Regenerate recovery codes
              </Button>
              {!required && (
                <Button variant="danger-outline" leftIcon={ShieldOff} onClick={() => setPrompt("disable")}>
                  Disable
                </Button>
              )}
            </div>
            {required && (
              <p className="text-fg-subtle text-xs">
                Your role requires two-factor sign-in, so it can&apos;t be turned off.
              </p>
            )}
          </>
        )}
      </CardBody>

      {prompt && (
        <PasswordPromptModal
          key={prompt}
          open
          title={prompt === "disable" ? "Disable two-factor sign-in?" : "Regenerate recovery codes?"}
          description={
            prompt === "disable"
              ? "Your account will be protected by your password only."
              : "Your existing recovery codes will stop working."
          }
          confirmLabel={prompt === "disable" ? "Disable" : "Regenerate"}
          danger={prompt === "disable"}
          onClose={() => setPrompt(null)}
          onConfirm={onPassword}
        />
      )}
    </Card>
  );
}

export function SecurityTab() {
  const user = useAuthStore((s) => s.user);
  const mustEnable = !!user?.two_factor_required && !user.two_factor_enabled;

  return (
    <div className="space-y-5">
      {mustEnable && (
        <div
          role="alert"
          className="border-danger/30 bg-danger-soft flex items-start gap-3 rounded-xl border p-4"
        >
          <ShieldAlert size={20} className="text-danger mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-danger text-sm font-semibold">Two-factor authentication is required</p>
            <p className="text-fg-muted mt-0.5 text-sm">
              Your role ({user?.role?.name.replace(/_/g, " ")}) requires two-factor sign-in. Set it up below
              to keep using the admin panel.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TwoFactorCard />
        <ChangePasswordCard />
      </div>
    </div>
  );
}
