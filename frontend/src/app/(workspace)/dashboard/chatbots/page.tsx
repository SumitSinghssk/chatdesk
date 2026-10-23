import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { Chatbots } from "./_components/Chatbots";

export const metadata: Metadata = { title: "Chatbots" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="h-full" />}>
      <Chatbots />
    </Suspense>
  );
}
