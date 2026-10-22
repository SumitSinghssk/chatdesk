import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Avatar, Badge } from "@/app/admin/_components/ui/index";
import type { Customer } from "@/app/admin/_lib/api/customersApi";
import { timeAgo } from "@/lib/utils";

import { METHOD_LABELS } from "./CustomerModal";

const WHATSAPP_BADGES = {
  connected: { tone: "success", label: "WhatsApp connected" },
  error: { tone: "danger", label: "WhatsApp error" },
  not_connected: { tone: "neutral", label: "Not connected" },
} as const;

export function WhatsAppBadge({ row }: { row: Customer }) {
  const badge = WHATSAPP_BADGES[row.whatsapp.status];
  return (
    <Badge tone={badge.tone} dot>
      {row.whatsapp.status === "connected" && row.whatsapp.display_phone_number
        ? row.whatsapp.display_phone_number
        : badge.label}
    </Badge>
  );
}

export const customerName = (row: Customer) =>
  row.business_name || row.name || row.email || row.phone || `Customer #${row.id}`;

/** The person behind the business, shown under the business name. */
export const contactName = (row: Customer) => (row.business_name ? row.name : null);

export function CustomerListItem({
  row,
  slots,
  status,
  actions,
}: {
  row: Customer;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox}
      <Avatar name={customerName(row)} src={row.avatar} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-fg truncate font-semibold">{customerName(row)}</span>
          <WhatsAppBadge row={row} />
        </div>
        <p className="text-fg-subtle truncate text-xs">
          {[contactName(row), row.email, row.phone, METHOD_LABELS[row.signup_method]]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span className="text-fg-subtle hidden shrink-0 text-xs md:block">
        {row.last_login_at ? `Seen ${timeAgo(row.last_login_at)}` : "Never signed in"}
      </span>
      <span className="shrink-0">{status}</span>
      <span className="hidden shrink-0 sm:block">{actions}</span>
    </div>
  );
}

export function CustomerCard({
  row,
  slots,
  status,
  actions,
}: {
  row: Customer;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="relative flex flex-col items-center text-center">
        <span className="absolute top-0 right-0">{slots.checkbox}</span>
        <Avatar name={customerName(row)} src={row.avatar} size={64} />
        <p className="text-fg mt-3 line-clamp-1 font-semibold">{customerName(row)}</p>
        <p className="text-fg-subtle text-xs">
          {contactName(row) ?? (row.last_login_at ? `Seen ${timeAgo(row.last_login_at)}` : "Never signed in")}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          <WhatsAppBadge row={row} />
        </div>
      </div>

      <div className="text-fg-subtle my-3 flex min-h-4 flex-col items-center gap-1 text-xs">
        {row.email && (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{row.email}</span>
          </span>
        )}
        {row.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {row.phone}
          </span>
        )}
      </div>

      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        {status}
        {actions}
      </div>
    </>
  );
}
