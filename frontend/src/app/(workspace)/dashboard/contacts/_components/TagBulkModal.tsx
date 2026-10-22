"use client";

import { useState } from "react";

import { Button, Input, Modal } from "@/app/admin/_components/ui/index";

/** Asks which tag to add to / remove from the selected contacts. */
export function TagBulkModal({
  mode,
  count,
  suggestions,
  onClose,
  onApply,
}: {
  mode: "add_tag" | "remove_tag" | null;
  count: number;
  suggestions: string[];
  onClose: () => void;
  onApply: (tag: string) => Promise<void>;
}) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const adding = mode === "add_tag";

  const apply = async () => {
    if (!tag.trim()) return;
    setBusy(true);
    await onApply(tag.trim());
    setBusy(false);
    setTag("");
  };

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      size="sm"
      title={adding ? "Add a tag" : "Remove a tag"}
      description={`${adding ? "Adds" : "Removes"} the tag ${adding ? "to" : "from"} ${count} selected contact${count === 1 ? "" : "s"}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!tag.trim()}
            loading={busy}
            onClick={apply}
            variant={adding ? "primary" : "danger"}
          >
            {adding ? "Add tag" : "Remove tag"}
          </Button>
        </>
      }
    >
      <Input
        label="Tag"
        name="bulk_tag"
        autoFocus
        list="bulk-tag-options"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void apply()}
        maxLength={40}
      />
      <datalist id="bulk-tag-options">
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions.slice(0, 10).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className="border-line text-fg-subtle hover:border-primary hover:text-primary rounded-full border px-2 py-0.5 text-[11px]"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
