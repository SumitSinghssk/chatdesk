"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";

import { Button, Checkbox, ErrorBanner, Input } from "@/app/admin/_components/ui/index";
import { isTwoFactorRequired, login } from "@/app/admin/_lib/api/authApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";

import { useAuthStore } from "@/app/admin/_store/authStore";

import { useCompleteLogin } from "./useLoginRedirect";

import { ADMIN_ROUTES } from "@/config/routes";
const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean(),
});
type LoginValues = z.infer<typeof schema>;

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const completeLogin = useCompleteLogin();
  const setPendingTwoFactor = useAuthStore((s) => s.setPendingTwoFactor);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: false },
  });
  const { register, handleSubmit, formState, control } = form;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await login(values);
      if (isTwoFactorRequired(result)) {
        setPendingTwoFactor({ token: result.two_factor_token, remember: values.remember });
        const next = searchParams.get("next");
        router.push(ADMIN_ROUTES.TWO_FACTOR({ next }));
        return;
      }
      completeLogin(result);
    } catch (err) {
      setError(apiErrorMessage(err, "Sign in failed"));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {searchParams.get("idle") && !error && (
        <div className="border-line bg-info-soft text-info flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm">
          You were signed out after a period of inactivity.
        </div>
      )}
      {searchParams.get("reset") && !error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          Your password was reset. Sign in with your new password.
        </div>
      )}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        leftIcon={Mail}
        error={formState.errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        placeholder="Enter your password"
        leftIcon={Lock}
        error={formState.errors.password?.message}
        rightAddon={
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            leftIcon={showPassword ? EyeOff : Eye}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
            className="text-fg-faint hover:text-primary -mr-1.5"
          />
        }
        {...register("password")}
      />
      {error && <ErrorBanner message={error} />}
      <div className="flex items-center justify-between gap-3">
        <Controller
          control={control}
          name="remember"
          render={({ field }) => (
            <Checkbox label="Remember me" checked={field.value} onChange={field.onChange} />
          )}
        />
        <Link
          href={ADMIN_ROUTES.FORGOT_PASSWORD()}
          className="text-primary text-sm font-medium hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" fullWidth loading={formState.isSubmitting} rightIcon={ArrowRight}>
        {formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
