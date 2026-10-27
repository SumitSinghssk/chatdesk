"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button, Input, Modal } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import { diagramsApi } from "../../_lib/diagramsApi";

/** Put a diagram in a folder (a new one, or one that exists), or take it out. */
export function FolderDialog({
  open,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  value: string | null;
  onClose: () => void;
  onSave: (folder: string | null) => Promise<void>;
}) {
  const [folder, setFolder] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const folders = useQuery({
    queryKey: ["diagrams", "list", { folders: true }],
    queryFn: async () => (await diagramsApi.list({})).folders ?? [],
    enabled: open,
  });
  const save = async (next: string | null) => {
    setBusy(true);
    try {
      await onSave(next);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move to folder"
      size="sm"
      footer={
        <div className="flex w-full justify-between gap-2">
          <Button variant="ghost" disabled={!value || busy} onClick={() => void save(null)}>
            No folder
          </Button>
          <Button loading={busy} disabled={!folder.trim()} onClick={() => void save(folder.trim())}>
            Move
          </Button>
        </div>
      }
    >
      <Input
        name="folder"
        label="Folder"
        value={folder}
        maxLength={60}
        list="diagram-folders"
        placeholder="e.g. Sales, Projects, Onboarding"
        onChange={(e) => setFolder(e.target.value)}
        hint="Type a new name, or pick one you already use."
        autoFocus
      />
      <datalist id="diagram-folders">
        {(folders.data ?? []).map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {(folders.data ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(folders.data ?? []).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFolder(f)}
              className="border-line text-fg-muted hover:bg-hover rounded-full border px-2.5 py-1 text-xs font-medium"
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
