import { createCrudApi, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { Status } from "./types";

export type CustomerMethod = "password" | "otp" | "google" | "admin";
export type WhatsAppState = "connected" | "error" | "not_connected";

export interface CustomerWhatsApp {
  status: WhatsAppState;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  last_event_at: string | null;
}

export interface Customer {
  id: number;
  name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  status: Status;
  signup_method: CustomerMethod;
  whatsapp: CustomerWhatsApp;
  has_password: boolean;
  google_linked: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  last_login_method: CustomerMethod | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerSession {
  id: number;
  method: CustomerMethod | null;
  ip_address: string | null;
  browser: string | null;
  platform: string | null;
  device: string | null;
  created_at: string;
  last_active_at: string;
}

export interface CustomerDetail extends Customer {
  sessions: CustomerSession[];
}

export interface CustomerPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  password?: string | null;
  status: Status;
  business_name?: string | null;
}

export interface CustomerStats {
  total: number;
  active: number;
  inactive: number;
  active_30d: number;
  phone_verified: number;
  methods: Record<CustomerMethod, number>;
  whatsapp: Record<WhatsAppState, number>;
  this_week: number;
  last_week: number;
}

const E = ADMIN_ENDPOINTS.CUSTOMERS;

export const customersApi = {
  ...createCrudApi<Customer, CustomerPayload>(E),
  detail: (id: number) => getOne<CustomerDetail>(E.SHOW(id)),
  stats: () => getOne<CustomerStats>(E.STATS),
  signOut: (id: number) => send<null>("post", E.SIGN_OUT(id)),
};
