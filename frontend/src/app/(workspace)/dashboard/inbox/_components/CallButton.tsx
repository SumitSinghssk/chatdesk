"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, PhoneForwarded } from "lucide-react";
import { toast } from "sonner";

import { Button, Dropdown } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import { WA_CALLS_QK, waCallsApi } from "../../_lib/waCallsApi";
import { useWaCalls } from "../../_components/calls/CallManager";
import { Tooltip } from "../../_components/Tooltip";

/** WhatsApp call from the chat header: call now, or ask the customer for permission first. */
export function CallButton({ conversationId, name }: { conversationId: number; name: string }) {
  const qc = useQueryClient();
  const calls = useWaCalls();
  const permission = useQuery({
    queryKey: WA_CALLS_QK.PERMISSION(conversationId),
    queryFn: async () => (await waCallsApi.permission(conversationId)).data,
    enabled: calls.enabled,
    staleTime: 30_000,
  });
  if (!calls.enabled || !permission.data) return null;
  const p = permission.data;

  const ask = async () => {
    try {
      const res = await waCallsApi.requestPermission(conversationId);
      toast.success(res.message ?? "Permission request sent");
      qc.setQueryData(WA_CALLS_QK.PERMISSION(conversationId), res.data);
      void qc.invalidateQueries({ queryKey: ["inbox", "messages", conversationId] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (p.can_call) {
    return (
      <Tooltip label={p.warning ?? `WhatsApp call ${name}`} align="end">
        <Button
          iconOnly
          variant="ghost"
          size="sm"
          leftIcon={Phone}
          aria-label={`WhatsApp call ${name}`}
          disabled={calls.busy}
          onClick={() => void calls.start(conversationId, name)}
        />
      </Tooltip>
    );
  }
  return (
    <Dropdown
      width="w-72"
      trigger={() => (
        <Button iconOnly variant="ghost" size="sm" leftIcon={Phone} aria-label="WhatsApp call options" />
      )}
      items={[
        ...(p.can_request
          ? [{ label: "Ask permission to call", icon: PhoneForwarded, onClick: () => void ask() }]
          : []),
        {
          label: p.reason ?? `${name} can't be called right now`,
          icon: Phone,
          disabled: true,
          onClick: () => undefined,
        },
      ]}
    />
  );
}
