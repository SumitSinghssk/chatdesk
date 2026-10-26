import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";

/** One of the workspace's WhatsApp numbers. Each keeps its own chats, contacts, templates and the rest. */
export interface WaNumber {
  id: number;
  label: string;
  main: boolean;
  status: "connected" | "error" | "pending" | "not_connected";
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  unread: number;
  current: boolean;
}

const N = CUSTOMER_ENDPOINTS.NUMBERS;

export const NUMBERS_QK = { LIST: ["numbers"] as const };

export const numbersApi = {
  list: () => request<WaNumber[]>("GET", N.LIST),
  switchTo: (id: number) => request<WaNumber>("POST", N.SWITCH(id)),
  create: (label: string) => request<WaNumber>("POST", N.LIST, { label }),
  rename: (id: number, label: string) => request<WaNumber>("PUT", N.ONE(id), { label }),
  remove: (id: number, confirm: string) => request<null>("POST", N.DELETE(id), { confirm }),
};

const CHANNEL = "cd-number";

/** Tells the other tabs the number changed, so every tab works on the same one. */
export function announceNumber(id: number) {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(id);
    bc.close();
  } catch {}
}

export function onNumberChange(handler: (id: number) => void): () => void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => handler(Number(e.data));
    return () => bc.close();
  } catch {
    return () => {};
  }
}
