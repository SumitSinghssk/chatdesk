"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2, LogIn, MessageSquareText, UserRoundPlus } from "lucide-react";

import { notifyMemberChange } from "@/app/(customer)/_components/AccountLink";
import { GoogleButton } from "@/app/(customer)/_components/GoogleButton";
import {
  CustomerApiError,
  customerApi,
  errorMessage,
  safeNext,
  type AuthOptions,
} from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { Alert, Button, Field } from "@/app/(customer)/_components/ui";
import { OtpForm } from "@/app/(customer)/_components/OtpForm";

type Mode = "login" | "register";
type Method = "password" | "otp";

function PasswordLogin({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const next: Record<string, string> = {};
    if (data.login.trim().length < 3) next.login = "Enter your email or mobile number";
    if (!data.password) next.password = "Enter your password";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await customerApi.login({ login: data.login.trim(), password: data.password });
      onDone();
    } catch (err) {
      const api = err instanceof CustomerApiError ? err : null;
      if (api?.errors.login) setFormError(api.errors.login);
      else {
        setErrors(api?.errors ?? {});
        setFormError(api && Object.keys(api.errors).length ? "" : errorMessage(err));
      }
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Field
        label="Email or mobile number"
        name="login"
        autoComplete="username"
        autoFocus
        error={errors.login}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={errors.password}
      />
      <Button type="submit" full loading={busy} icon={LogIn}>
        Sign in
      </Button>
    </form>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const next: Record<string, string> = {};
    if (data.name.trim().length < 2) next.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) next.email = "Enter a valid email";
    if (!data.password) next.password = "Choose a password";
    if (data.password !== data.password_confirmation) next.password_confirmation = "Passwords don't match";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await customerApi.register({
        name: data.name.trim(),
        business_name: data.business_name.trim() || undefined,
        email: data.email.trim(),
        phone: data.phone.trim() || undefined,
        password: data.password,
        password_confirmation: data.password_confirmation,
      });
      onDone();
    } catch (err) {
      const api = err instanceof CustomerApiError ? err : null;
      setErrors(api?.errors ?? {});
      setFormError(api && Object.keys(api.errors).length ? "" : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Full name" name="name" autoComplete="name" autoFocus error={errors.name} />
      <Field
        label="Business name"
        name="business_name"
        autoComplete="organization"
        error={errors.business_name}
        hint="Shown to your team and on your WhatsApp workspace. You can change it later."
      />
      <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
      <Field
        label={
          <>
            Mobile number <span className="text-fg-faint font-normal">(optional)</span>
          </>
        }
        name="phone"
        type="tel"
        autoComplete="tel"
        error={errors.phone}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
        />
        <Field
          label="Confirm password"
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          error={errors.password_confirmation}
        />
      </div>
      <Button type="submit" full loading={busy} icon={UserRoundPlus}>
        Create account
      </Button>
    </form>
  );
}

function MethodTabs({
  value,
  onChange,
  tabs,
}: {
  value: Method;
  onChange: (m: Method) => void;
  tabs: { key: Method; label: string; icon: typeof KeyRound }[];
}) {
  return (
    <div role="tablist" className="bg-page border-line grid grid-cols-2 gap-1 rounded-xl border p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
            value === t.key ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg"
          )}
        >
          <t.icon className="h-4 w-4" aria-hidden />
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function AuthPage({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"), CUSTOMER_ROUTES.DASHBOARD());
  const [options, setOptions] = useState<AuthOptions | null>(null);
  const [loadError, setLoadError] = useState("");
  const [chosen, setChosen] = useState<Method | null>(null);
  const [googleError, setGoogleError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    customerApi
      .options()
      .then((res) => setOptions(res.data))
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const done = () => {
    notifyMemberChange();
    router.replace(next);
    router.refresh();
  };

  const google = async (credential: string) => {
    setGoogleBusy(true);
    setGoogleError("");
    try {
      await customerApi.google(credential);
      done();
    } catch (err) {
      setGoogleError(errorMessage(err));
      setGoogleBusy(false);
    }
  };

  const register = mode === "register";
  const title = register ? "Create your account" : "Welcome back";
  const subtitle = register ? "Join in a few seconds." : "Sign in to your account.";

  let body: React.ReactNode;
  if (loadError) {
    body = <Alert>{loadError}</Alert>;
  } else if (!options) {
    body = (
      <div className="text-fg-subtle flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  } else if (register && !options.registration) {
    body = <Alert>New sign-ups are closed right now. If you already have an account, sign in instead.</Alert>;
  } else {
    const passwordTab = register
      ? { key: "password" as const, label: "Email", icon: KeyRound }
      : { key: "password" as const, label: "Password", icon: KeyRound };
    const tabs = [
      ...(options.password ? [passwordTab] : []),
      ...(options.otp ? [{ key: "otp" as const, label: "Mobile OTP", icon: MessageSquareText }] : []),
    ];
    const method = tabs.find((t) => t.key === chosen)?.key ?? tabs[0]?.key;
    body = (
      <div className="space-y-5">
        {options.google && options.google_client_id && (
          <div className="space-y-2">
            <GoogleButton
              clientId={options.google_client_id}
              text={register ? "signup_with" : "continue_with"}
              onCredential={google}
            />
            {googleBusy && (
              <p className="text-fg-subtle flex items-center justify-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Signing you in…
              </p>
            )}
            {googleError && <Alert>{googleError}</Alert>}
          </div>
        )}
        {options.google && tabs.length > 0 && (
          <div className="text-fg-faint flex items-center gap-3 text-xs font-medium tracking-wide uppercase">
            <span className="bg-line h-px flex-1" />
            or
            <span className="bg-line h-px flex-1" />
          </div>
        )}
        {tabs.length > 1 && <MethodTabs value={method!} onChange={setChosen} tabs={tabs} />}
        {method === "password" &&
          (register ? <RegisterForm onDone={done} /> : <PasswordLogin onDone={done} />)}
        {method === "otp" && <OtpForm options={options} onDone={done} />}
        {!tabs.length && !options.google && <Alert>Signing in isn&apos;t available right now.</Alert>}
      </div>
    );
  }

  const canRegister = options?.registration ?? true;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="border-line bg-surface rounded-2xl border p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="text-fg text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-fg-subtle mt-1.5 text-sm">{subtitle}</p>
        </div>
        {body}
      </div>
      {options && (
        <p className="text-fg-subtle mt-6 text-center text-sm">
          {register ? (
            <>
              Already have an account?{" "}
              <Link
                href={CUSTOMER_ROUTES.LOGIN({ next: searchParams.get("next") })}
                className="text-primary font-semibold"
              >
                Sign in
              </Link>
            </>
          ) : (
            canRegister &&
            options.password && (
              <>
                New here?{" "}
                <Link
                  href={CUSTOMER_ROUTES.REGISTER({ next: searchParams.get("next") })}
                  className="text-primary font-semibold"
                >
                  Create an account
                </Link>
              </>
            )
          )}
        </p>
      )}
    </div>
  );
}
