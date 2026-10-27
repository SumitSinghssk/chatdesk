import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { DiagramEditor } from "../_components/DiagramEditor";

export const metadata: Metadata = { title: "Diagram" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <DiagramEditor id={Number(id)} />
    </Suspense>
  );
}
