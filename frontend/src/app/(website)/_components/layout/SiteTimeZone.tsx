"use client";

import { setDisplayTimeZone } from "@/lib/utils";

export function SiteTimeZone({ timeZone }: { timeZone: string | null | undefined }) {
  setDisplayTimeZone(timeZone);
  return null;
}
