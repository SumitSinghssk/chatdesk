"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Webhook as WebhookIcon } from "lucide-react";
import { toast } from "sonner";

import { Button, Checkbox, Input, Modal, Switch } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";

import { EVENT_GROUPS, INTEGRATIONS_QK, integrationsApi, type Webhook } from "../../_lib/integrationsApi";

/** Add or edit a webhook: the URL to call and which events to send there. */
export function WebhookModal({
  webhook,
  open,
  onClose,
  onSaved,
}: {
  webhook: Webhook | null;
  open: boolean;
  onClose: () => void;
  onSaved: (w: Webhook) => void;
}) {
  const { data: events } = useQuery({
    queryKey: INTEGRATIONS_QK.EVENTS,
    queryFn: async () => (await integrationsApi.events()).data,
    staleTime: 600_000,
  });
  const [url, setUrl] = useState(webhook?.url ?? "");
  const [description, setDescription] = useState(webhook?.description ?? "");
  const [all, setAll] = useState(webhook ? webhook.events.includes("*") : false);
  const [picked, setPicked] = useState<string[]>(
    webhook && !webhook.events.includes("*") ? webhook.events : ["message.received"]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const toggle = (event: string, on: boolean) =>
    setPicked((list) => (on ? [...list, event] : list.filter((e) => e !== event)));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await integrationsApi.saveWebhook(
        {
          url,
          description: description || null,
          events: all ? ["*"] : picked,
          enabled: webhook?.enabled ?? true,
        },
        webhook?.id
      );
      toast.success(res.message ?? "Saved");
      onSaved(res.data);
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={webhook ? "Edit webhook" : "Add a webhook"}
      description="ChatDesk sends a POST request with JSON to this URL each time one of the chosen events happens."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftIcon={WebhookIcon}
            loading={saving}
            disabled={!url.trim() || (!all && !picked.length)}
            onClick={save}
          >
            {webhook ? "Save" : "Add webhook"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)]">
          <Input
            name="webhook_url"
            label="Endpoint URL"
            required
            autoFocus
            inputMode="url"
            placeholder="https://yourapp.com/webhooks/chatdesk"
            value={url}
            error={errors.url}
            onChange={(e) => setUrl(e.target.value)}
            hint="Must be a public https:// address that answers within 10 seconds."
          />
          <Input
            name="webhook_description"
            label="Description"
            placeholder="Optional, e.g. CRM sync"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-fg mb-1 text-sm font-semibold">Events to send</legend>
          <Switch
            checked={all}
            onChange={setAll}
            label="All events"
            hint="Includes events we add in the future."
          />
          {!all && (
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {EVENT_GROUPS.map((g) => {
                const list = (events ?? []).filter((e) => e.event.startsWith(g.prefix));
                if (!list.length) return null;
                return (
                  <div key={g.prefix} className="space-y-2">
                    <p className="text-fg-subtle text-[11px] font-semibold tracking-wide uppercase">
                      {g.label}
                    </p>
                    {list.map((e) => (
                      <Checkbox
                        key={e.event}
                        checked={picked.includes(e.event)}
                        onChange={(on) => toggle(e.event, on)}
                        label={<code className="text-fg font-mono text-xs">{e.event}</code>}
                        hint={e.description}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {errors.events && <p className="text-danger text-xs">{errors.events}</p>}
        </fieldset>
      </div>
    </Modal>
  );
}
