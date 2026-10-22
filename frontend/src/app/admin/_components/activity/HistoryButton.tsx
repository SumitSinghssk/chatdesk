"use client";

import { History } from "lucide-react";

import Button from "@/app/admin/_components/ui/Button";
import { useCan } from "@/app/admin/_hooks/usePermissions";
import { useHistoryStore, type HistorySubject } from "@/app/admin/_store/historyStore";
import { PERM } from "@/config/permissions";
import { cn } from "@/lib/utils";

export function HistoryButton({ subject, className }: { subject: HistorySubject; className?: string }) {
  const canView = useCan(PERM.ACTIVITY_LOGS_VIEW);
  const open = useHistoryStore((s) => s.open);
  if (!canView) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      leftIcon={History}
      aria-label="History"
      title="History"
      onClick={() => open(subject)}
      className={cn("text-fg-faint hover:bg-hover hover:text-fg", className)}
    />
  );
}
