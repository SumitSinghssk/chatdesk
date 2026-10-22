"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UserRoundCheck } from "lucide-react";

import { notifyMemberChange } from "@/app/(customer)/_components/AccountLink";
import { Alert, Button, Field } from "@/app/(customer)/_components/ui";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { teamApi, type InviteInfo } from "@/app/(workspace)/dashboard/_lib/teamApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

const ROLE_TEXT = {
  agent: "an agent: you'll chat with customers in the shared inbox",
  admin: "an admin: you'll manage templates, campaigns and the team too",
  owner: "the owner",
};

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    teamApi
      .invitation(token)
      .then((res) => setInvite(res.data))
      .catch((err) => setLoadError(errorMessage(err)));
  }, [token]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const next: Record<string, string> = {};
    if (data.name.trim().length < 2) next.name = "Enter your name";
    if (!data.password) next.password = "Choose a password";
    if (data.password !== data.password_confirmation) next.password_confirmation = "Passwords don't match";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await teamApi.accept(token, {
        name: data.name.trim(),
        password: data.password,
        password_confirmation: data.password_confirmation,
      });
      notifyMemberChange();
      router.replace(CUSTOMER_ROUTES.INBOX());
      router.refresh();
    } catch (err) {
      const api = err instanceof CustomerApiError ? err : null;
      setErrors(api?.errors ?? {});
      setFormError(api && Object.keys(api.errors).length ? "" : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="border-line bg-surface rounded-2xl border p-6 shadow-sm sm:p-8">
        {loadError ? (
          <div className="space-y-4 text-center">
            <h1 className="text-fg text-2xl font-bold tracking-tight">Invite not found</h1>
            <Alert>{loadError}</Alert>
            <Link href={CUSTOMER_ROUTES.LOGIN()} className="text-primary text-sm font-semibold">
              Go to sign in
            </Link>
          </div>
        ) : !invite ? (
          <div className="text-fg-subtle flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <span className="bg-primary/10 text-primary mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
                <UserRoundCheck className="h-6 w-6" />
              </span>
              <h1 className="text-fg text-2xl font-bold tracking-tight">
                Join {invite.workspace ?? "the team"}
              </h1>
              <p className="text-fg-subtle mt-1.5 text-sm">
                {invite.invited_by ? `${invite.invited_by} invited you` : "You've been invited"} as{" "}
                {ROLE_TEXT[invite.role] ?? invite.role}.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-4" noValidate>
              {formError && <Alert>{formError}</Alert>}
              <Field
                label="Email"
                name="email"
                value={invite.email}
                readOnly
                disabled
                hint="You'll sign in with this email."
              />
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                autoFocus
                defaultValue={invite.name ?? ""}
                error={errors.name}
              />
              <Field
                label="Choose a password"
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
              <Button type="submit" full loading={busy} icon={UserRoundCheck}>
                Join the team
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
