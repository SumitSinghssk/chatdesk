"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button, Checkbox, ErrorText, Modal } from "@/app/admin/_components/ui/index";
import { backupsApi } from "@/app/admin/_lib/api/backupsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";

export function BackupNowModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [includeDatabase, setIncludeDatabase] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await backupsApi.create({ include_database: includeDatabase, include_files: includeFiles });
      toast.success(res.message ?? "Backup started");
      onStarted();
    } catch (err) {
      setError(apiErrorMessage(err, "The backup could not be started."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Make a backup now"
      description="Runs in the background on the server. You can leave this page; the list updates when it's done."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon={Save} loading={busy} disabled={!includeDatabase && !includeFiles} onClick={start}>
            Start backup
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Checkbox
          checked={includeDatabase}
          onChange={setIncludeDatabase}
          label="Database"
          hint="All content, users and settings (pg_dump, .sql.gz)."
        />
        <Checkbox
          checked={includeFiles}
          onChange={setIncludeFiles}
          label="Uploaded files"
          hint="Images and documents in storage/uploads (.zip)."
        />
        {!includeDatabase && !includeFiles && (
          <ErrorText message="Choose the database, the uploaded files, or both." />
        )}
        {error && <ErrorText message={error} />}
      </div>
    </Modal>
  );
}
