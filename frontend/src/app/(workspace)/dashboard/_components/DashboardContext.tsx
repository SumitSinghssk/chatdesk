"use client";

import { createContext, useContext } from "react";

import type { AuthOptions, CustomerProfile } from "@/app/(customer)/_lib/customerApi";

import type { WaNumber } from "../_lib/numbersApi";

export interface DashboardState {
  me: CustomerProfile;
  options: AuthOptions;
  setMe: (me: CustomerProfile) => void;
  /** the WhatsApp numbers this person may work on, and the one in use */
  numbers: WaNumber[];
  number: WaNumber;
  switchNumber: (id: number, opts?: { to?: string }) => Promise<void>;
}

export const DashboardContext = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used inside the dashboard layout");
  return value;
}
