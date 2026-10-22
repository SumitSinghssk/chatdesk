"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock } from "lucide-react";

import { Button, ErrorBanner, Input } from "@/app/admin/_components/ui/index";
import { resetPassword } from "@/app/admin/_lib/api/authApi";
import { applyServerErrors } from "@/app/admin/_lib/form";

import { ADMIN_ROUTES } from "@/config/routes";
const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    password_confirmation: z.string(),
  })
  .refine((v) => v.password === v.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });
type Values = z.infer<typeof schema>;

export default function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", password_confirmation: "" },
  });
  const { register, handleSubmit, formState, setError } = form;

  if (!token || !email) {
    return (
      <ErrorBanner message="This reset link is incomplete. Request a new one from the forgot password page." />
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await resetPassword({ token, email, ...values });
      router.replace(ADMIN_ROUTES.LOGIN({ reset: "1" }));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't reset password", ["password", "password_confirmation"]);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input label="Email" value={email} disabled readOnly />
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        leftIcon={Lock}
        error={formState.errors.password?.message}
        {...register("password")}
      />
      <Input
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        leftIcon={Lock}
        error={formState.errors.password_confirmation?.message}
        {...register("password_confirmation")}
      />
      <Button type="submit" size="lg" fullWidth loading={formState.isSubmitting}>
        Reset password
      </Button>
    </form>
  );
}
