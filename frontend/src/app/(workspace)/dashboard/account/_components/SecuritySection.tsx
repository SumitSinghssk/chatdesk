"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  Download,
  History,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, Input, Modal, Skeleton } from "@/app/admin/_components/ui/index";
import { GoogleButton } from "@/app/(customer)/_components/GoogleButton";
import { CustomerApiError, customerApi, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { DevicesCard, PasswordCard } from "../../_components/AccountCards";
import { CardHeader } from "../../_components/CardHeader";
import { useDashboard } from "../../_components/DashboardContext";
import { ACCOUNT_QK, accountApi } from "../../_lib/accountApi";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.2v3.1C3.2 21.3 7.3 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.2C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l4.1-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.6l4.1 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
      />
    </svg>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  const download = () => {
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(
        new Blob([`ChatDesk recovery codes\n\n${text}\n\nEach code works once.\n`], { type: "text/plain" })
      ),
      download: "chatdesk-recovery-codes.txt",
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Modal
      open
      onClose={onDone}
      variant="modal"
      size="sm"
      title="Save your recovery codes"
      description="If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe: they won't be shown again."
      footer={
        <div className="flex w-full justify-end">
          <Button onClick={onDone}>I&apos;ve saved them</Button>
        </div>
      }
    >
      <ul
        className="border-line bg-surface-2 grid grid-cols-2 gap-2 rounded-xl border p-4 font-mono text-sm"
        aria-label="Recovery codes"
      >
        {codes.map((c) => (
          <li key={c} className="text-fg text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={Copy}
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => null);
            toast.success("Codes copied");
          }}
        >
          Copy
        </Button>
        <Button variant="secondary" size="sm" leftIcon={Download} onClick={download}>
          Download
        </Button>
      </div>
    </Modal>
  );
}

function Confirm({
  title,
  description,
  action,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  action: string;
  danger?: boolean;
  onConfirm: (body: { password?: string; code?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const { me } = useDashboard();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onConfirm(me.has_password ? { password: value } : { code: value });
      onClose();
    } catch (err) {
      setError(
        err instanceof CustomerApiError
          ? err.errors.password || err.errors.code || err.message
          : errorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} variant="modal" size="sm" title={title} description={description}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={me.has_password ? "Your password" : "A code from your authenticator app"}
          type={me.has_password ? "password" : "text"}
          inputMode={me.has_password ? undefined : "numeric"}
          autoComplete={me.has_password ? "current-password" : "one-time-code"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} loading={busy} disabled={!value}>
            {action}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TwoFactorCard() {
  const qc = useQueryClient();
  const { me, setMe } = useDashboard();
  const security = useQuery({
    queryKey: ACCOUNT_QK.SECURITY,
    queryFn: () => accountApi.security().then((r) => r.data),
  });
  const [setup, setSetup] = useState<{ secret: string; qr_svg: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [asking, setAsking] = useState<"codes" | "disable" | null>(null);
  const status = security.data?.two_factor;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ACCOUNT_QK.SECURITY });
    setMe((await customerApi.me()).data);
  };
  const start = async () => {
    setBusy(true);
    try {
      setSetup((await accountApi.setupTwoFactor()).data);
      setCode("");
      setError("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await accountApi.confirmTwoFactor(code.replace(/\s/g, ""));
      setCodes(res.data.recovery_codes);
      setSetup(null);
      await refresh();
      toast.success("Two-step sign-in is on");
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.errors.code || err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Two-step sign-in"
        icon={ShieldCheck}
        description="Ask for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) every time you sign in."
        actions={
          status?.enabled ? (
            <Badge tone="success" dot>
              On
            </Badge>
          ) : (
            <Badge>Off</Badge>
          )
        }
      />
      <div className="p-5">
        {!status ? (
          <Skeleton className="h-16" />
        ) : status.enabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="bg-success-soft text-success flex h-10 w-10 items-center justify-center rounded-xl">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-fg text-sm font-medium">Your account is protected</p>
              <p className="text-fg-subtle text-xs">
                On since {formatDateTime(status.confirmed_at)} · {status.recovery_left} recovery code
                {status.recovery_left === 1 ? "" : "s"} left
              </p>
            </div>
            <Button variant="secondary" size="sm" leftIcon={KeyRound} onClick={() => setAsking("codes")}>
              New recovery codes
            </Button>
            <Button
              variant="danger-outline"
              size="sm"
              leftIcon={ShieldOff}
              onClick={() => setAsking("disable")}
            >
              Turn off
            </Button>
          </div>
        ) : setup ? (
          <form onSubmit={confirm} className="grid gap-5 md:grid-cols-[200px_1fr]">
            <div
              className="border-line mx-auto w-48 rounded-xl border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              aria-label="QR code to scan with your authenticator app"
              role="img"
              dangerouslySetInnerHTML={{ __html: setup.qr_svg }}
            />
            <div className="space-y-3">
              <ol className="text-fg-muted list-decimal space-y-1 pl-5 text-sm">
                <li>Open your authenticator app and add an account.</li>
                <li>Scan the QR code, or type this key:</li>
              </ol>
              <p className="border-line bg-surface-2 text-fg rounded-lg border px-3 py-2 font-mono text-sm tracking-wider break-all">
                {setup.secret.match(/.{1,4}/g)?.join(" ")}
              </p>
              <Input
                label="3. Enter the 6-digit code it shows"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                error={error}
                wrapperClassName="max-w-48"
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" loading={busy} disabled={code.replace(/\s/g, "").length !== 6}>
                  Turn on
                </Button>
                <Button variant="ghost" onClick={() => setSetup(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="bg-warning-soft text-warning flex h-10 w-10 items-center justify-center rounded-xl">
              <Smartphone className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-fg-muted min-w-0 flex-1 text-sm">
              Even if someone learns your password{me.has_password ? "" : " or gets a sign-in code"}, they
              can&apos;t get in without your phone.
            </p>
            <Button leftIcon={ShieldCheck} loading={busy} onClick={start}>
              Set up
            </Button>
          </div>
        )}
      </div>
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
      {asking === "codes" && (
        <Confirm
          title="Make new recovery codes"
          description="The old codes stop working."
          action="Make new codes"
          onClose={() => setAsking(null)}
          onConfirm={async (body) => {
            const res = await accountApi.newRecoveryCodes(body);
            setCodes(res.data.recovery_codes);
            await refresh();
          }}
        />
      )}
      {asking === "disable" && (
        <Confirm
          title="Turn off two-step sign-in?"
          description="Signing in will only need your password or a mobile code again."
          action="Turn off"
          danger
          onClose={() => setAsking(null)}
          onConfirm={async (body) => {
            await accountApi.disableTwoFactor(body);
            await refresh();
            toast.success("Two-step sign-in is off");
          }}
        />
      )}
    </Card>
  );
}

function GoogleCard() {
  const { me, options, setMe } = useDashboard();
  const [busy, setBusy] = useState(false);
  if (!options.google || !options.google_client_id) return null;
  const link = async (credential: string) => {
    setBusy(true);
    try {
      const res = await accountApi.linkGoogle(credential);
      setMe(res.data);
      toast.success("Google connected");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setBusy(true);
    try {
      setMe((await accountApi.unlinkGoogle()).data);
      toast.success("Google disconnected");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Sign in with Google"
        icon={KeyRound}
        description="Use your Google account to sign in with one click."
      />
      <div className="flex flex-wrap items-center gap-3 p-5">
        <span className="border-line flex h-10 w-10 items-center justify-center rounded-xl border bg-white">
          <GoogleMark />
        </span>
        <p className="text-fg-muted min-w-0 flex-1 text-sm">
          {me.google_linked ? "Your Google account is connected." : "Not connected."}
        </p>
        {me.google_linked ? (
          <Button variant="secondary" size="sm" loading={busy} onClick={unlink}>
            Disconnect
          </Button>
        ) : (
          <div className="w-60">
            <GoogleButton clientId={options.google_client_id} text="continue_with" onCredential={link} />
          </div>
        )}
      </div>
    </Card>
  );
}

function LoginHistory() {
  const history = useQuery({
    queryKey: ACCOUNT_QK.HISTORY,
    queryFn: () => accountApi.loginHistory().then((r) => r.data),
  });
  const rows = history.data ?? [];
  return (
    <Card>
      <CardHeader
        title="Login history"
        icon={History}
        description="Recent sign-ins and failed attempts on your account."
      />
      {history.isLoading ? (
        <div className="p-5">
          <Skeleton className="h-24" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-fg-subtle p-5 text-sm">Nothing yet.</p>
      ) : (
        <ul className="divide-line divide-y" aria-label="Login history">
          {rows.slice(0, 15).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
              {r.success ? (
                <CheckCircle2 className="text-success h-4 w-4 shrink-0" aria-label="Succeeded" />
              ) : (
                <XCircle className="text-danger h-4 w-4 shrink-0" aria-label="Failed" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm">
                  {r.success
                    ? r.reason === "waiting for the two-step code"
                      ? "Password correct, code asked"
                      : "Signed in"
                    : "Failed"}{" "}
                  <span className="text-fg-subtle">
                    · {r.method}
                    {r.reason && !r.success ? ` · ${r.reason}` : ""}
                  </span>
                </p>
                <p className="text-fg-subtle truncate text-xs">
                  {[r.browser, r.platform].filter(Boolean).join(" on ") || "Unknown device"} ·{" "}
                  {r.ip_address ?? "unknown IP"}
                </p>
              </div>
              <span className="text-fg-faint shrink-0 text-xs" title={formatDateTime(r.created_at)}>
                {timeAgo(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SecuritySection() {
  const { me, setMe } = useDashboard();
  return (
    <div className="space-y-5">
      <TwoFactorCard />
      <PasswordCard me={me} onSaved={setMe} />
      <GoogleCard />
      <DevicesCard />
      <LoginHistory />
    </div>
  );
}
