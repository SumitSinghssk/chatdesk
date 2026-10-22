import { ExternalLink, Save } from "lucide-react";

import { Button } from "@/app/admin/_components/ui/index";

export function EditorFooter({
  dirty,
  isEdit,
  canSave,
  submitting,
  viewUrl,
  onCancel,
}: {
  dirty: boolean;
  isEdit: boolean;
  canSave: boolean;
  submitting: boolean;
  viewUrl?: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="border-line bg-surface sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t px-5 py-3">
      {dirty ? (
        <span className="text-warning text-xs font-medium">Unsaved changes</span>
      ) : isEdit ? (
        <span className="text-fg-subtle text-xs">All changes saved</span>
      ) : null}
      <div className="ml-auto flex flex-wrap gap-2">
        {viewUrl && (
          <Button variant="ghost" leftIcon={ExternalLink} href={viewUrl} target="_blank">
            View on site
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel}>
          {canSave ? "Cancel" : "Close"}
        </Button>
        {canSave && (
          <Button type="submit" leftIcon={Save} loading={submitting}>
            {isEdit ? "Save changes" : "Create"}
          </Button>
        )}
      </div>
    </div>
  );
}
