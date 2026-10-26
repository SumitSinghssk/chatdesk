"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Receipt } from "lucide-react";

import { Button, Skeleton } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { timeAgo } from "@/lib/utils";

import { ORDERS_QK, ordersApi } from "../../_lib/commerceApi";
import { StatusBadge } from "../../commerce/_components/orders/labels";

/** The contact panel's orders: how much they've spent, their latest orders, and making a new one. */
export function ContactOrders({ contactId }: { contactId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ORDERS_QK.CONTACT(contactId),
    queryFn: async () => (await ordersApi.forContact(contactId)).data,
    refetchInterval: 20_000,
  });
  return (
    <div className="space-y-2.5">
      {isLoading ? (
        <Skeleton className="h-12 rounded-lg" />
      ) : data && data.orders.length > 0 ? (
        <>
          <p className="text-fg text-xs">
            <span className="font-semibold">{data.count}</span> order{data.count === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold">{data.spent_text}</span> spent
          </p>
          <ul className="space-y-1.5" aria-label="Their orders">
            {data.orders.slice(0, 4).map((o) => (
              <li key={o.id}>
                <Link
                  href={CUSTOMER_ROUTES.COMMERCE_ORDER(o.id)}
                  className="border-line hover:border-line-strong hover:bg-hover flex items-center gap-2 rounded-lg border px-2.5 py-2 transition"
                >
                  <Receipt className="text-fg-faint h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="text-fg block text-xs font-semibold">
                      {o.ref} · {o.total_text}
                    </span>
                    <span className="text-fg-subtle block text-[11px]">
                      {timeAgo(o.placed_at ?? o.created_at)}
                    </span>
                  </span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-fg-subtle text-xs">No orders yet.</p>
      )}
      <Button
        size="sm"
        variant="secondary"
        leftIcon={Plus}
        fullWidth
        href={CUSTOMER_ROUTES.COMMERCE_ORDER_NEW({ contact: contactId })}
      >
        Create order
      </Button>
    </div>
  );
}
