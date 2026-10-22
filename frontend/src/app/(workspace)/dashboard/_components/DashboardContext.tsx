"use client";

import { createContext, useContext } from "react";

import type { AuthOptions, CustomerProfile } from "@/app/(customer)/_lib/customerApi";

export interface DashboardState {
  me: CustomerProfile;
  options: AuthOptions;
  setMe: (me: CustomerProfile) => void;
}

export const DashboardContext = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used inside the dashboard layout");
  return value;
}
