"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import type { BulkAction } from "@/app/admin/_lib/api/types";

import type { BulkSelection } from "./useBulkSelection";

interface CrudLike {
  remove: (id: number) => Promise<{ message?: string }>;
  toggle?: (id: number) => Promise<{ message?: string }>;
  bulk?: (ids: number[], action: BulkAction) => Promise<{ message?: string }>;
}

export function useListActions({
  api,
  queryKey,
  noun,
  selection,
  softDelete = true,
}: {
  api: CrudLike;
  queryKey: string;
  noun: string;
  selection?: BulkSelection;
  softDelete?: boolean;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [queryKey] });

  const run = async (fn: () => Promise<{ message?: string }>, fallback: string) => {
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      await refresh();
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, fallback));
      return false;
    }
  };

  return {
    refresh,
    async remove(id: number, label: string) {
      const ok = await confirm({
        title: `Delete ${noun}?`,
        message: softDelete ? (
          <>
            <b>{label}</b> will be moved to the trash. You can restore it later.
          </>
        ) : (
          <>
            <b>{label}</b> will be permanently deleted. This can&apos;t be undone.
          </>
        ),
        confirmLabel: "Delete",
      });
      if (ok) await run(() => api.remove(id), `Couldn't delete ${noun}`);
    },
    toggle(id: number) {
      return run(() => api.toggle!(id), "Couldn't change status");
    },
    async bulk(action: BulkAction) {
      if (!selection?.count || !api.bulk) return;
      if (action === "delete") {
        const ok = await confirm({
          title: `Delete ${selection.count} item(s)?`,
          message: softDelete
            ? "Selected items will be moved to the trash."
            : "Selected items will be permanently deleted.",
          confirmLabel: "Delete",
        });
        if (!ok) return;
      }
      if (await run(() => api.bulk!(selection.ids, action), "Bulk action failed")) selection.clear();
    },
  };
}
