"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { KeyRound, LogOut, Monitor, Smartphone, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { OtpCodeField, useCountdown } from "@/app/(customer)/_components/OtpForm";
import {
  Badge,
  Button,
  Card,
  CardBody,
  ErrorBanner,
  Input,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import {
  CustomerApiError,
  customerApi,
  errorMessage,
  type AuthOptions,
  type CustomerDevice,
  type CustomerProfile,
  type OtpSent,
} from "@/app/(customer)/_lib/customerApi";
import { timeAgo } from "@/lib/utils";
import { CardHeader } from "./CardHeader";

const METHOD_LABELS: Record<string, string> = {
  password: "password",
  otp: "mobile code",
  google: "Google",
};

function fieldErrors(err: unknown) {
  return err instanceof CustomerApiError ? err.errors : {};
}

/** Field errors go under their inputs; anything else becomes a toast. */
function report(err: unknown, setErrors: (e: Record<string, string>) => void) {
  const errors = fieldErrors(err);
  setErrors(errors);
  if (!Object.keys(errors).length) toast.error(errorMessage(err));
}

function Panel({
  title,
  description,
  icon,
  badge,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} icon={icon} actions={badge} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

const Verified = () => (
  <Badge tone="success" dot>
    Verified
  </Badge>
);

export function ProfileCard({
  me,
  options,
  onSaved,
}: {
  me: CustomerProfile;
  options: AuthOptions;
  onSaved: (c: CustomerProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (data.name.trim().length < 2) {
      setErrors({ name: "Enter your name" });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const res = await customerApi.updateProfile({
        name: data.name.trim(),
        business_name: (data.business_name ?? me.business_name ?? "").trim() || null,
        email: data.email.trim() || null,
      });
      onSaved(res.data);
      toast.success(res.message ?? "Profile saved");
    } catch (err) {
      report(err, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Profile" description="Your name, business, email and mobile number." icon={UserRound}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {me.role === "owner" ? (
            <Input
              label="Business name"
              name="business_name"
              autoComplete="organization"
              defaultValue={me.business_name ?? ""}
              error={errors.business_name}
            />
          ) : (
            <Input
              label="Workspace"
              value={me.workspace?.name ?? ""}
              readOnly
              disabled
              hint={`You're ${me.role === "admin" ? "an admin" : "an agent"} here. The owner sets the business name.`}
            />
          )}
          <Input
            label="Your name"
            name="name"
            required
            autoComplete="name"
            defaultValue={me.name ?? ""}
            error={errors.name}
          />
        </div>
        <Input
          label={
            <span className="inline-flex items-center gap-2">Email {me.email_verified && <Verified />}</span>
          }
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={me.email ?? ""}
          error={errors.email}
        />
        <Button type="submit" loading={busy}>
          Save profile
        </Button>
      </form>
      <div className="border-line mt-6 border-t pt-5">
        <PhoneSettings me={me} options={options} onSaved={onSaved} />
      </div>
    </Panel>
  );
}

function PhoneSettings({
  me,
  options,
  onSaved,
}: {
  me: CustomerProfile;
  options: AuthOptions;
  onSaved: (c: CustomerProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timer = useCountdown();

  const fail = (err: unknown) => {
    report(err, setErrors);
    const wait = err instanceof CustomerApiError ? (err.data as { resend_in?: number } | null)?.resend_in : 0;
    if (wait) timer.start(wait);
  };

  const send = async (target: string) => {
    setBusy(true);
    setErrors({});
    try {
      const res = await customerApi.sendPhoneCode(target);
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
    setBusy(true);
    setErrors({});
    try {
      const res = await customerApi.verifyPhone({ phone: sent.phone, code });
      onSaved(res.data);
      setSent(null);
      setEditing(false);
      toast.success(res.message ?? "Mobile number verified");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setEditing(false);
    setSent(null);
    setErrors({});
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-fg text-sm font-semibold">Mobile number</p>
          <p className="text-fg-subtle text-xs">Used to sign in with a one-time code and to reach you.</p>
        </div>
        {me.phone && (me.phone_verified ? <Verified /> : <Badge tone="warning">Not verified</Badge>)}
      </div>
      {!editing && !sent && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-fg text-sm font-medium">
            {me.phone ?? <span className="text-fg-subtle font-normal">No mobile number yet</span>}
          </p>
          {options.phone_verification && (
            <div className="flex gap-2">
              {me.phone && !me.phone_verified && (
                <Button variant="secondary" loading={busy} onClick={() => send(me.phone!)}>
                  Verify
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {me.phone ? "Change" : "Add number"}
              </Button>
            </div>
          )}
        </div>
      )}
      {editing && !sent && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(phone);
          }}
          className="space-y-4"
          noValidate
        >
          <Input
            label="New mobile number"
            name="phone"
            type="tel"
            autoComplete="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            hint={`Numbers without a + code are treated as +${options.default_country_code}.`}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Send code
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {sent && (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-fg-muted text-sm">
            Enter the code we sent to <span className="text-fg font-semibold">{sent.phone}</span>.
          </p>
          <OtpCodeField length={sent.length} value={code} onChange={setCode} error={errors.code} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={busy} disabled={code.length !== sent.length}>
              Verify
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button
              variant="link"
              className="ml-auto"
              disabled={timer.left > 0 || busy}
              onClick={() => send(sent.phone)}
            >
              {timer.left > 0 ? `Resend in ${timer.left}s` : "Resend code"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PasswordCard({
  me,
  onSaved,
}: {
  me: CustomerProfile;
  onSaved: (c: CustomerProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const next: Record<string, string> = {};
    if (me.has_password && !data.current_password) next.current_password = "Enter your current password";
    if (!data.password) next.password = "Choose a new password";
    if (data.password !== data.password_confirmation) next.password_confirmation = "Passwords don't match";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const res = await customerApi.updatePassword({
        current_password: data.current_password || undefined,
        password: data.password,
        password_confirmation: data.password_confirmation,
      });
      onSaved(res.data);
      form.reset();
      toast.success(res.message ?? "Password saved");
    } catch (err) {
      report(err, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={me.has_password ? "Change password" : "Set a password"}
      description={
        me.has_password
          ? "Changing it signs you out on your other devices."
          : "Add a password to also sign in with your email or mobile number."
      }
      icon={KeyRound}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {me.has_password && (
          <Input
            label="Current password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            error={errors.current_password}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            error={errors.password}
          />
          <Input
            label="Confirm password"
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            error={errors.password_confirmation}
          />
        </div>
        <Button type="submit" loading={busy}>
          {me.has_password ? "Change password" : "Set password"}
        </Button>
      </form>
    </Panel>
  );
}

export function DevicesCard() {
  const [devices, setDevices] = useState<CustomerDevice[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    customerApi
      .sessions()
      .then((res) => setDevices(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(load, [load]);

  const revoke = async (id: number) => {
    setBusyId(id);
    try {
      await customerApi.revokeSession(id);
      setDevices((list) => list?.filter((d) => d.id !== id) ?? null);
      toast.success("Device signed out");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Signed-in devices"
        description="Sign out of any device you don't recognise."
        icon={Monitor}
      />
      {error && <ErrorBanner className="m-4" message={error} />}
      {!devices ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <ul className="divide-line divide-y">
          {devices.map((d) => {
            const Icon = d.device === "mobile" || d.device === "tablet" ? Smartphone : Monitor;
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Icon size={18} className="text-fg-subtle shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-fg flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate">
                      {[d.browser, d.platform].filter(Boolean).join(" on ") || "Unknown device"}
                    </span>
                    {d.current && <Badge tone="info">This device</Badge>}
                  </p>
                  <p className="text-fg-subtle truncate text-xs">
                    {d.ip_address ?? "Unknown IP"} · active {timeAgo(d.last_active_at)}
                    {d.method && METHOD_LABELS[d.method]
                      ? ` · signed in with ${METHOD_LABELS[d.method]}`
                      : ""}
                  </p>
                </div>
                {!d.current && (
                  <Button
                    variant="danger-outline"
                    size="sm"
                    leftIcon={LogOut}
                    loading={busyId === d.id}
                    onClick={() => revoke(d.id)}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
