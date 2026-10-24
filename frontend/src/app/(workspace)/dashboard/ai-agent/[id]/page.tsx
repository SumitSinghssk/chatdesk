import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { AgentWorkspace } from "../_components/workspace/AgentWorkspace";

export const metadata: Metadata = { title: "AI agent" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <AgentWorkspace id={Number(id)} />
    </Suspense>
  );
}
