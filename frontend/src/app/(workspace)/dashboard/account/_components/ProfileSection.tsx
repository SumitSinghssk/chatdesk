"use client";

import { useRef, useState } from "react";
import { Camera, Mail, Save, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Avatar, Badge, Button, Card, Input } from "@/app/admin/_components/ui/index";
import { CustomerApiError, customerApi, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { PhoneSettings, Verified } from "../../_components/AccountCards";
import { CardHeader } from "../../_components/CardHeader";
import { useDashboard } from "../../_components/DashboardContext";
import { accountApi } from "../../_lib/accountApi";

function Photo() {
  const { me, setMe } = useDashboard();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Choose a photo under 5 MB");
      return;
    }
    setBusy(true);
    try {
      const res = await accountApi.uploadAvatar(file);
      setMe(res.data);
      toast.success("Photo updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      setMe((await accountApi.removeAvatar()).data);
      toast.success("Photo removed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full"
        aria-label="Change your photo"
        disabled={busy}
      >
        <Avatar name={me.name ?? me.email ?? "You"} src={me.avatar} size={80} className="rounded-full" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-5 w-5" aria-hidden />
        </span>
      </button>
      <div className="space-y-1.5">
        <p className="text-fg text-sm font-semibold">Profile photo</p>
        <p className="text-fg-subtle text-xs">Shown to your team. PNG, JPG or WebP, up to 5 MB.</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={Camera}
            loading={busy}
            onClick={() => input.current?.click()}
          >
            {me.avatar ? "Change" : "Upload"}
          </Button>
          {me.avatar && (
            <Button size="sm" variant="ghost" leftIcon={Trash2} onClick={remove} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Choose a photo"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function EmailChange() {
  const { me, setMe } = useDashboard();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const waiting = !!me.pending_email;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await accountApi.changeEmail({ email: email.trim(), password: password || undefined });
      setDevCode(res.data.dev_code ?? null);
      setMe((await customerApi.me()).data);
      toast.success(res.message ?? "Code sent");
      setOpen(false);
    } catch (err) {
      if (err instanceof CustomerApiError && Object.keys(err.errors).length) setErrors(err.errors);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await accountApi.verifyEmail(code);
      setMe(res.data);
      setCode("");
      setDevCode(null);
      toast.success("Email changed and verified");
    } catch (err) {
      if (err instanceof CustomerApiError && Object.keys(err.errors).length) setErrors(err.errors);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setMe((await accountApi.cancelEmail()).data);
    setDevCode(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-fg flex items-center gap-2 text-sm font-semibold">
            Email{" "}
            {me.email && me.email_verified ? (
              <Verified />
            ) : me.email ? (
              <Badge tone="warning">Not verified</Badge>
            ) : null}
          </p>
          <p className="text-fg mt-0.5 text-sm">
            {me.email ?? <span className="text-fg-subtle">No email yet</span>}
          </p>
          <p className="text-fg-subtle text-xs">For sign-in, security alerts and notifications.</p>
        </div>
        {!open && !waiting && (
          <Button variant="secondary" size="sm" leftIcon={Mail} onClick={() => setOpen(true)}>
            {me.email ? "Change email" : "Add email"}
          </Button>
        )}
      </div>
      {open && !waiting && (
        <form onSubmit={send} className="border-line bg-surface-2 space-y-3 rounded-xl border p-4" noValidate>
          <Input
            label="New email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoFocus
          />
          {me.has_password && (
            <Input
              label="Your password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
          )}
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={!email.trim()}>
              Send code
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {waiting && (
        <form
          onSubmit={verify}
          className="border-line bg-surface-2 space-y-3 rounded-xl border p-4"
          noValidate
        >
          <p className="text-fg-muted text-sm">
            Enter the 6-digit code we sent to <b className="text-fg">{me.pending_email}</b>. Your email
            changes once it&apos;s confirmed.
          </p>
          {devCode && (
            <p className="bg-info-soft text-info rounded-lg px-3 py-2 text-xs">
              Email isn&apos;t set up on this server, so here is the code:{" "}
              <b className="font-mono">{devCode}</b>
            </p>
          )}
          <Input
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            error={errors.code}
            wrapperClassName="max-w-40"
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={code.length !== 6}>
              Confirm email
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function ProfileSection() {
  const { me, options, setMe } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if ((data.name ?? "").trim().length < 2) {
      setErrors({ name: "Enter your name" });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const res = await customerApi.updateProfile({
        name: data.name.trim(),
        business_name: (data.business_name ?? me.business_name ?? "").trim() || null,
        email: me.email,
        job_title: (data.job_title ?? "").trim() || null,
      });
      setMe(res.data);
      toast.success("Profile saved");
    } catch (err) {
      if (err instanceof CustomerApiError && Object.keys(err.errors).length) setErrors(err.errors);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Profile" icon={UserRound} description="How you appear to your team." />
        <div className="space-y-6 p-5">
          <Photo />
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Your name"
                name="name"
                required
                autoComplete="name"
                defaultValue={me.name ?? ""}
                error={errors.name}
              />
              <Input
                label="Job title"
                name="job_title"
                autoComplete="organization-title"
                placeholder="e.g. Sales manager"
                defaultValue={me.job_title ?? ""}
              />
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
            </div>
            <Button type="submit" leftIcon={Save} loading={busy}>
              Save profile
            </Button>
          </form>
        </div>
      </Card>
      <Card>
        <CardHeader title="Contact details" icon={Mail} description="Used to sign in and to reach you." />
        <div className="divide-line divide-y px-5">
          <div className="py-5">
            <EmailChange />
          </div>
          <div className="py-5">
            <PhoneSettings me={me} options={options} onSaved={setMe} />
          </div>
        </div>
      </Card>
    </div>
  );
}
