"use client";

import { useQuery } from "@tanstack/react-query";

import { useDashboard } from "../../_components/DashboardContext";
import { WORKSPACE_QK, whatsappApi } from "../../_lib/whatsappApi";

/** The name customers see at the top of the chat: the WhatsApp verified name, else the business name. */
export function useBusinessName() {
  const { me } = useDashboard();
  const { data } = useQuery({
    queryKey: WORKSPACE_QK.CONNECTION,
    queryFn: async () => (await whatsappApi.connection()).data,
    staleTime: 60_000,
  });
  return data?.verified_name || me.business_name || me.name || "Your business";
}
