"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, EmptyState, Input, Modal, Skeleton } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { Tooltip } from "../../_components/Tooltip";
import { useSortable } from "../../_components/useSortable";
import { COMMERCE_QK, commerceApi, type Collection } from "../../_lib/commerceApi";

/** Add or rename a collection. Used here and from the product editor. */
export function CollectionModal({
  open,
  collection,
  onClose,
  onSaved,
}: {
  open: boolean;
  collection?: Collection | null;
  onClose: () => void;
  onSaved?: (saved: { id: number; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return setError("Name the collection");
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null };
      const res = collection
        ? await commerceApi.updateCollection(collection.id, body)
        : await commerceApi.createCollection(body);
      toast.success(res.message ?? "Collection saved");
      await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      setError(err instanceof CustomerApiError ? (err.errors.name ?? err.message) : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={collection ? "Rename collection" : "New collection"}
      description="Collections group products, e.g. Sweets or Gift boxes. They become sections in product lists."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          label="Name"
          name="collection_name"
          required
          maxLength={80}
          value={name}
          error={error}
          placeholder="e.g. Gift boxes"
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          hint="WhatsApp shows the first 24 characters as a section title."
        />
        <Input
          label="Description"
          name="collection_description"
          maxLength={300}
          value={description}
          placeholder="Optional, only for your team"
          onChange={(e) => setDescription(e.target.value)}
        />
      </form>
    </Modal>
  );
}

export function CollectionsTab({ collections }: { collections: Collection[] | undefined }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Collection | "new" | null>(null);
  const rows = collections ?? [];
  const byId = new Map(rows.map((c) => [c.id, c]));
  const sort = useSortable(
    rows.map((c) => c.id),
    async (ids) => {
      try {
        await commerceApi.reorderCollections(ids);
        await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.COLLECTIONS });
      } catch (err) {
        toast.error(errorMessage(err));
      }
    }
  );

  const remove = async (c: Collection) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: c.products
        ? `Its ${c.products} product${c.products === 1 ? " stays" : "s stay"}, just without a collection.`
        : "It has no products.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await commerceApi.deleteCollection(c.id);
      toast.success("Collection deleted");
      await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle max-w-xl text-sm">
          Drag to set the order. It&apos;s the order of sections when you send a list of products.
        </p>
        <Button leftIcon={Plus} onClick={() => setEditing("new")}>
          New collection
        </Button>
      </div>

      {!collections ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No collections yet"
          description="Group your products, e.g. Sweets, Namkeen and Gift boxes, so customers can browse by section."
          action={
            <Button leftIcon={Plus} onClick={() => setEditing("new")}>
              New collection
            </Button>
          }
        />
      ) : (
        <ul className="border-line divide-line divide-y rounded-xl border" aria-label="Collections">
          {sort.order.map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            const lifted = sort.dragging === c.id;
            return (
              <li
                key={c.id}
                ref={sort.rowRef(c.id)}
                className={cn(
                  "bg-surface flex items-center gap-3 px-3 py-3 transition-shadow first:rounded-t-xl last:rounded-b-xl",
                  lifted && "ring-primary/40 relative z-10 shadow-lg ring-2"
                )}
              >
                <button
                  type="button"
                  aria-label={`Reorder ${c.name}: drag, or use the arrow keys`}
                  title="Drag to reorder"
                  {...sort.handleProps(c.id)}
                  className={cn(
                    "text-fg-faint hover:text-fg hover:bg-hover -ml-1 rounded p-1 select-none",
                    lifted ? "cursor-grabbing" : "cursor-grab"
                  )}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <FolderOpen className="h-4 w-4" aria-hidden />
                </span>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`${CUSTOMER_ROUTES.COMMERCE()}?tab=products&collection_id=${c.id}`)
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="text-fg block truncate text-sm font-medium hover:underline">{c.name}</span>
                  <span className="text-fg-subtle block truncate text-xs">
                    {c.products} product{c.products === 1 ? "" : "s"}
                    {c.description ? ` · ${c.description}` : ""}
                  </span>
                </button>
                <Tooltip label="Rename">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    leftIcon={Pencil}
                    aria-label={`Rename ${c.name}`}
                    onClick={() => setEditing(c)}
                    className="text-fg-faint hover:bg-primary-soft hover:text-primary"
                  />
                </Tooltip>
                <Tooltip label="Delete" align="end">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    leftIcon={Trash2}
                    aria-label={`Delete ${c.name}`}
                    onClick={() => remove(c)}
                    className="text-fg-faint hover:text-danger hover:bg-danger-soft"
                  />
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <CollectionModal
          open
          collection={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
