"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { ConfirmProvider } from "./ConfirmProvider";
import { getQueryClient } from "@/app/admin/_lib/queryClient";
import { useThemeStore } from "@/app/admin/_store/themeStore";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);
  const mode = useThemeStore((s) => s.mode);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <Toaster
        position="bottom-right"
        theme={mode}
        closeButton
        duration={4000}
        toastOptions={{
          classNames: {
            toast: "!rounded-xl !border !border-line !bg-surface !shadow-lg !p-3.5 !gap-3 !font-sans",
            title: "!text-sm !font-semibold !text-fg",
            description: "!text-sm !text-fg-subtle",
            success: "[&_[data-icon]]:!text-emerald-600",
            error: "[&_[data-icon]]:!text-red-600",
            warning: "[&_[data-icon]]:!text-amber-500",
            info: "[&_[data-icon]]:!text-indigo-600",
          },
        }}
      />
    </QueryClientProvider>
  );
}
