"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageCircle, Pencil, RefreshCw, Send, Unplug } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  Card,
  CardBody,
  ErrorBanner,
  Input,
  PageHeader,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { timeAgo } from "@/lib/utils";

import { WORKSPACE_QK, whatsappApi, type WhatsAppConnection as Connection } from "../_lib/whatsappApi";
import { CardHeader } from "./CardHeader";

const EMPTY_FORM = { waba_id: "", phone_number_id: "", access_token: "", app_secret: "" };

const STATUS = {
  connected: { tone: "success", label: "Connected" },
  pending: { tone: "warning", label: "Pending" },
  error: { tone: "danger", label: "Error" },
} as const;

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <p className="text-fg-muted dark:text-fg mb-1.5 text-[13px] font-medium">{label}</p>
      <div className="border-line-strong bg-page flex items-center gap-2 rounded-lg border py-1 pr-1 pl-3">
        <code className="text-fg min-w-0 flex-1 truncate text-[13px]">{value}</code>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={copied ? Check : Copy}
          onClick={copy}
          aria-label={`Copy ${label}`}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-fg-subtle text-xs">{label}</dt>
      <dd className="text-fg mt-0.5 text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

export function WhatsAppConnection() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const {
    data: connection,
    isLoading,
    error,
  } = useQuery({
    queryKey: WORKSPACE_QK.CONNECTION,
    queryFn: async () => (await whatsappApi.connection()).data,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "refresh" | "test" | "disconnect" | null>(null);
  const [test, setTest] = useState({
    to: "",
    text: "Hello! This is a test message from our new WhatsApp workspace.",
  });
  const [testError, setTestError] = useState("");

  // With no number yet the form is always open; otherwise "Edit details" opens it pre-filled.
  const showForm = editing || !connection;
  const toggleEditing = () => {
    if (!editing && connection) {
      setForm({ ...EMPTY_FORM, waba_id: connection.waba_id, phone_number_id: connection.phone_number_id });
    }
    setErrors({});
    setEditing(!editing);
  };

  const store = (next: Connection | null) => {
    queryClient.setQueryData(WORKSPACE_QK.CONNECTION, next);
    void queryClient.invalidateQueries({ queryKey: WORKSPACE_QK.OVERVIEW });
  };

  const run = async (
    kind: NonNullable<typeof busy>,
    task: () => Promise<{ message?: string; data: Connection | null }>
  ) => {
    setBusy(kind);
    setErrors({});
    try {
      const res = await task();
      store(res.data);
      // A save or refresh can succeed while Meta still rejects the details
      if (res.data?.status === "error") toast.error(res.message ?? "Meta rejected the details");
      else if (res.message) toast.success(res.message);
      return res.data;
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await run("save", () =>
      whatsappApi.save({
        waba_id: form.waba_id,
        phone_number_id: form.phone_number_id,
        access_token: form.access_token || undefined,
        app_secret: form.app_secret || undefined,
      })
    );
    if (saved) {
      setEditing(false);
      setForm(EMPTY_FORM);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect this WhatsApp number?",
      message: "Messages stop arriving in this workspace. You can connect the number again later.",
      confirmLabel: "Disconnect",
      variant: "danger",
    });
    if (!ok) return;
    await run("disconnect", () => whatsappApi.disconnect());
    setEditing(false);
    setForm(EMPTY_FORM);
  };

  const sendTest = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("test");
    setTestError("");
    try {
      const res = await whatsappApi.sendTest(test);
      toast.success(res.message ?? "Message sent", {
        description: `Message id ${res.data.message_id ?? "—"}`,
      });
    } catch (err) {
      setTestError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader icon={MessageCircle} title="WhatsApp setup" />
        <Skeleton className="h-64 max-w-4xl rounded-xl" />
      </>
    );
  }

  const status = connection ? STATUS[connection.status] : null;

  return (
    <>
      <PageHeader
        icon={MessageCircle}
        title="WhatsApp setup"
        description="Connect your WhatsApp Business number through the official Meta Cloud API."
        actions={
          connection && (
            <>
              <Button
                variant="secondary"
                leftIcon={RefreshCw}
                loading={busy === "refresh"}
                onClick={() => run("refresh", () => whatsappApi.refresh())}
              >
                Refresh
              </Button>
              <Button variant="secondary" leftIcon={Pencil} onClick={toggleEditing}>
                {editing ? "Cancel editing" : "Edit details"}
              </Button>
            </>
          )
        }
      />

      {error && <ErrorBanner className="mb-4" message={errorMessage(error)} />}

      <div className="grid max-w-6xl grid-cols-1 gap-5 xl:grid-cols-2">
        {connection && (
          <Card>
            <CardHeader
              title="Your WhatsApp number"
              description="Details come straight from Meta."
              actions={
                status && (
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                )
              }
            />
            <CardBody className="space-y-4">
              {connection.last_error && <ErrorBanner message={`Meta said: ${connection.last_error}`} />}
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Detail label="Phone number" value={connection.display_phone_number} />
                <Detail label="Display name" value={connection.verified_name} />
                <Detail label="Quality rating" value={connection.quality_rating} />
                <Detail label="Messaging limit" value={connection.messaging_limit_tier} />
                <Detail label="WABA ID" value={connection.waba_id} />
                <Detail label="Phone number ID" value={connection.phone_number_id} />
              </dl>
              <div className="border-line border-t pt-4">
                <Button
                  variant="danger-outline"
                  leftIcon={Unplug}
                  loading={busy === "disconnect"}
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {showForm && (
          <Card>
            <CardHeader
              title={connection ? "Update connection" : "Connect your number"}
              description="From Meta Business Suite → WhatsApp Manager and your Meta app (WhatsApp → API setup). Use a permanent system-user token, not the 24-hour test token."
            />
            <CardBody>
              <form onSubmit={save} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="WhatsApp Business Account ID"
                    name="waba_id"
                    required
                    inputMode="numeric"
                    value={form.waba_id}
                    onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
                    error={errors.waba_id}
                  />
                  <Input
                    label="Phone number ID"
                    name="phone_number_id"
                    required
                    inputMode="numeric"
                    value={form.phone_number_id}
                    onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
                    error={errors.phone_number_id}
                  />
                </div>
                <Input
                  label="Permanent access token"
                  name="access_token"
                  type="password"
                  autoComplete="off"
                  required={!connection?.has_access_token}
                  value={form.access_token}
                  onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                  error={errors.access_token}
                  hint={connection?.has_access_token ? "Saved. Leave blank to keep it." : "Stored encrypted."}
                />
                <Input
                  label="App secret (recommended)"
                  name="app_secret"
                  type="password"
                  autoComplete="off"
                  value={form.app_secret}
                  onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
                  error={errors.app_secret}
                  hint={
                    connection?.has_app_secret
                      ? "Saved. Leave blank to keep it."
                      : "Used to check that webhook calls really come from Meta."
                  }
                />
                <Button type="submit" loading={busy === "save"}>
                  {connection ? "Save changes" : "Connect number"}
                </Button>
              </form>
            </CardBody>
          </Card>
        )}

        {connection && (
          <Card>
            <CardHeader
              title="Webhook"
              description="In your Meta app open WhatsApp → Configuration, paste these values, click Verify and save, then subscribe to “messages”."
              actions={
                <Badge tone={connection.webhook_verified_at ? "success" : "warning"} dot>
                  {connection.webhook_verified_at
                    ? `Verified ${timeAgo(connection.webhook_verified_at)}`
                    : "Not verified"}
                </Badge>
              }
            />
            <CardBody className="space-y-4">
              <CopyField label="Callback URL" value={connection.webhook_url} />
              <CopyField label="Verify token" value={connection.verify_token} />
              <p className="text-fg-subtle text-xs">
                Meta must reach this URL over HTTPS. For local testing, expose the API with a tunnel such as
                ngrok and set APP_URL in backend/.env to the tunnel address. Graph API{" "}
                {connection.graph_api_version}.
              </p>
            </CardBody>
          </Card>
        )}

        {connection?.status === "connected" && (
          <Card>
            <CardHeader
              title="Send a test message"
              description="Free-form messages only reach people who messaged your number in the last 24 hours. Message your number from your phone first."
            />
            <CardBody>
              <form onSubmit={sendTest} className="space-y-4" noValidate>
                {testError && <ErrorBanner message={testError} />}
                <Input
                  label="To (with country code)"
                  name="to"
                  placeholder="919876543210"
                  inputMode="tel"
                  value={test.to}
                  onChange={(e) => setTest({ ...test, to: e.target.value })}
                />
                <Input
                  label="Message"
                  name="text"
                  value={test.text}
                  onChange={(e) => setTest({ ...test, text: e.target.value })}
                />
                <Button type="submit" leftIcon={Send} loading={busy === "test"} disabled={!test.to}>
                  Send test
                </Button>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
