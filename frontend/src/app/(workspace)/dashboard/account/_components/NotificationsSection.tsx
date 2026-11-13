"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Mail, Monitor, Save, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, Select, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import {
  askDesktopPermission,
  desktopPermission,
  playChime,
  showDesktop,
  type DesktopPermission,
} from "@/lib/alerts";
import { pushState, subscribePush, unsubscribePush, type PushState } from "@/lib/push";

import { CardHeader } from "../../_components/CardHeader";
import { useDashboard } from "../../_components/DashboardContext";
import {
  ACCOUNT_QK,
  accountApi,
  type ChannelSet,
  type NotificationSettings,
  type NotifyScope,
} from "../../_lib/accountApi";

const CHANNELS: { key: keyof ChannelSet; label: string; icon: typeof Bell }[] = [
  { key: "in_app", label: "In ChatDesk", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "browser", label: "Pop-up & push", icon: Monitor },
];

function usePermission(): DesktopPermission {
  return useSyncExternalStore(
    (cb) => {
      const t = setInterval(cb, 1500);
      return () => clearInterval(t);
    },
    desktopPermission,
    () => "default"
  );
}

const SCOPES: { value: NotifyScope; label: string; hint: string }[] = [
  { value: "mine", label: "Chats assigned to me", hint: "Only chats assigned to you" },
  {
    value: "mine_unassigned",
    label: "Mine and unassigned chats",
    hint: "Your chats and chats nobody has yet",
  },
  { value: "all", label: "Every chat I can see", hint: "Every chat you can open" },
];

/** Push to this browser or phone, so alerts arrive with ChatDesk closed. */
function PushCard() {
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: [...ACCOUNT_QK.NOTIFY, "push"],
    queryFn: () => accountApi.push().then((r) => r.data),
  });
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);

  const turnOn = async () => {
    if (!info.data?.public_key) return;
    setBusy(true);
    try {
      const sub = await subscribePush(info.data.public_key);
      if (!sub) {
        toast.error("The browser didn't allow notifications. Allow them for this site, then try again.");
      } else {
        await accountApi.pushSubscribe(sub);
        toast.success("Push notifications are on for this browser");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setState(await pushState());
      void qc.invalidateQueries({ queryKey: [...ACCOUNT_QK.NOTIFY, "push"] });
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribePush();
      if (endpoint) await accountApi.pushUnsubscribe(endpoint);
      toast.success("Push notifications are off for this browser");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setState(await pushState());
      void qc.invalidateQueries({ queryKey: [...ACCOUNT_QK.NOTIFY, "push"] });
      setBusy(false);
    }
  };

  if (info.data && !info.data.enabled) return null; // the server has no push keys
  const devices = info.data?.devices ?? 0;
  return (
    <Card>
      <CardHeader
        title="Push to this browser or phone"
        icon={Smartphone}
        description="Alerts that reach you even when ChatDesk is closed (for everything set to “Pop-up & push”)."
      />
      <div className="flex flex-wrap items-center gap-3 p-5">
        <p className="text-fg-muted min-w-0 flex-1 text-sm">
          {state === "on"
            ? "On for this browser."
            : state === "denied"
              ? "Blocked in this browser. Allow notifications for this site in the browser's settings."
              : state === "unsupported"
                ? "This browser can't receive push (on iPhone, add ChatDesk to the Home Screen first)."
                : "Off for this browser."}
          {devices > 0 && (
            <span className="text-fg-subtle block text-xs">
              On for {devices} browser{devices === 1 ? "" : "s"} or phone{devices === 1 ? "" : "s"} in total.
            </span>
          )}
        </p>
        {state === "on" ? (
          <Button variant="secondary" loading={busy} onClick={turnOff}>
            Turn off here
          </Button>
        ) : state === "off" ? (
          <Button loading={busy} disabled={!info.data?.public_key} onClick={turnOn}>
            Turn on push here
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function Editor({ initial }: { initial: NotificationSettings }) {
  const qc = useQueryClient();
  const { me } = useDashboard();
  const permission = usePermission();
  const start = JSON.stringify(initial);
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(start);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== saved;
  const events = Object.entries(form.events);

  const set = (event: string, channel: keyof ChannelSet, on: boolean) =>
    setForm((f) => ({
      ...f,
      events: { ...f.events, [event]: { ...f.events[event as keyof typeof f.events]!, [channel]: on } },
    }));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        events: Object.fromEntries(
          events.map(([k, v]) => [k, { in_app: v!.in_app, email: v!.email, browser: v!.browser }])
        ),
        waiting_minutes: form.waiting_minutes,
        scope: form.scope,
        quiet_when_away: form.quiet_when_away,
      };
      const res = await accountApi.saveNotificationSettings(body);
      qc.setQueryData(ACCOUNT_QK.NOTIFY, res.data);
      setSaved(JSON.stringify(res.data));
      setForm(res.data);
      toast.success("Notification settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="What you're told about"
          icon={BellRing}
          description="Choose how each event reaches you."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-line text-fg-subtle border-b text-left text-xs">
                <th className="px-5 py-2.5 font-medium">Event</th>
                {CHANNELS.map((c) => (
                  <th key={c.key} className="w-36 px-3 py-2.5 text-center font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <c.icon className="h-3.5 w-3.5" aria-hidden /> {c.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {events.map(([key, ev]) => (
                <tr key={key}>
                  <td className="text-fg px-5 py-3">
                    {ev!.label}
                    {key === "new_message" && (
                      <span className="text-fg-subtle block text-xs">
                        {SCOPES.find((o) => o.value === form.scope)?.hint}
                      </span>
                    )}
                    {key === "customer_waiting" && (
                      <span className="text-fg-subtle block text-xs">
                        After {form.waiting_minutes} minutes without a reply
                      </span>
                    )}
                  </td>
                  {CHANNELS.map((c) => (
                    <td key={c.key} className="px-3 py-3 text-center">
                      <span className="inline-flex justify-center">
                        <Switch
                          size="sm"
                          checked={ev![c.key]}
                          onChange={(on) => set(key, c.key, on)}
                          aria-label={`${ev!.label}: ${c.label}`}
                          disabled={c.key === "email" && !me.email}
                        />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-line grid gap-4 border-t p-5 sm:grid-cols-2">
          <Select
            label="A customer is “waiting” after"
            value={String(form.waiting_minutes)}
            onChange={(v) => setForm((f) => ({ ...f, waiting_minutes: Number(v) }))}
            options={[5, 10, 15, 30, 60, 120, 240].map((m) => ({
              value: String(m),
              label: m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`,
            }))}
          />
          <Select
            label="Tell me about new messages in"
            value={form.scope}
            onChange={(v) => setForm((f) => ({ ...f, scope: v as NotifyScope }))}
            options={SCOPES.map((o) => ({ value: o.value, label: o.label }))}
          />
          <div className="sm:col-span-2">
            <Switch
              label="Quiet while I'm Away"
              hint="No pop-ups or push while you've set yourself Away. The bell still keeps everything."
              checked={form.quiet_when_away}
              onChange={(quiet_when_away) => setForm((f) => ({ ...f, quiet_when_away }))}
            />
          </div>
          {!me.email && (
            <p className="text-fg-subtle self-end text-xs">Add an email in Profile to get emails.</p>
          )}
        </div>
        <div className="border-line flex justify-end border-t px-5 py-3">
          <Button leftIcon={Save} onClick={save} loading={busy} disabled={!dirty}>
            Save
          </Button>
        </div>
      </Card>
      <PushCard />
      <Card>
        <CardHeader
          title="Desktop pop-ups"
          icon={Monitor}
          description="Your browser shows them while ChatDesk is open in a tab."
        />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <p className="text-fg-muted min-w-0 flex-1 text-sm">
            {permission === "granted"
              ? "Allowed in this browser."
              : permission === "denied"
                ? "Blocked in this browser. Allow notifications for this site in the browser's settings."
                : permission === "unsupported"
                  ? "This browser doesn't support desktop notifications."
                  : "Not allowed yet in this browser."}
          </p>
          {permission === "default" && (
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await askDesktopPermission();
                if (result === "granted")
                  showDesktop("Desktop notifications are on", "You'll see ChatDesk alerts here.");
              }}
            >
              Allow pop-ups
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              playChime();
              showDesktop("This is a test notification", "From ChatDesk");
              toast("This is a test notification");
            }}
          >
            Send a test
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function NotificationsSection() {
  const settings = useQuery({
    queryKey: ACCOUNT_QK.NOTIFY,
    queryFn: () => accountApi.notificationSettings().then((r) => r.data),
  });
  if (!settings.data) return <Skeleton className="h-80 rounded-xl" />;
  return <Editor key={JSON.stringify(settings.data)} initial={settings.data} />;
}
