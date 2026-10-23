import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { AiAgents } from "./_components/AiAgents";

export const metadata: Metadata = { title: "AI agent" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <AiAgents />
    </Suspense>
  );
}
