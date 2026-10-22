"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ListTree, Plus, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardHeader, EmptyState } from "@/app/admin/_components/ui/index";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { useUnsavedChangesGuard } from "@/app/admin/(panel)/blogs/_components/useUnsavedChangesGuard";
import { menusApi, type Menu } from "@/app/admin/_lib/api/menusApi";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { timeAgo } from "@/lib/utils";

import { MenuItemRow, type DragState, type RowHandlers } from "./MenuItemRow";
import {
  MAX_DEPTH,
  canDrop,
  count,
  findInvalid,
  fromApi,
  moveTo,
  newNode,
  ops,
  toApi,
  type DropPosition,
  type TreeNode,
} from "./tree";

import { QK } from "@/config/query-keys";
export function MenuEditor({
  menu,
  canEdit,
  onDirtyChange,
}: {
  menu: Menu;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const initial = useMemo(() => fromApi(menu.items), [menu]);
  const [tree, setTree] = useState<TreeNode[]>(initial);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ uid: string; position: DropPosition } | null>(null);

  const baseline = useMemo(() => JSON.stringify(toApi(initial)), [initial]);
  const dirty = JSON.stringify(toApi(tree)) !== baseline;
  useUnsavedChangesGuard(dirty);

  const change = (next: TreeNode[]) => {
    setTree(next);
    onDirtyChange(JSON.stringify(toApi(next)) !== baseline);
  };
  const open = (uid: string) => setOpenIds((s) => new Set(s).add(uid));

  const handlers: RowHandlers = {
    update: (path, patch) => change(ops.update(tree, path, patch)),
    async remove(path, node) {
      if (node.children.length || node.label) {
        const ok = await confirm({
          title: "Remove menu item?",
          message: node.children.length ? (
            <>
              <b>{node.label || "This item"}</b> and its {count(node.children)} child item(s) will be removed.
            </>
          ) : (
            <>
              <b>{node.label}</b> will be removed from the menu.
            </>
          ),
          confirmLabel: "Remove",
        });
        if (!ok) return;
      }
      change(ops.remove(tree, path));
    },
    addChild(path) {
      const node = newNode();
      change(ops.addChild(tree, path, node));
      open(node.uid);
    },
    toggleOpen: (uid) =>
      setOpenIds((s) => {
        const next = new Set(s);
        if (next.has(uid)) next.delete(uid);
        else next.add(uid);
        return next;
      }),
  };

  const drag: DragState = {
    dragUid,
    dropAt,
    start: (uid) => setDragUid(uid),
    over(uid, position) {
      const ok = !!dragUid && canDrop(tree, dragUid, uid, position);
      const next = ok ? { uid, position } : null;
      if (next?.uid !== dropAt?.uid || next?.position !== dropAt?.position) setDropAt(next);
      return ok;
    },
    drop() {
      if (dragUid && dropAt) change(moveTo(tree, dragUid, dropAt.uid, dropAt.position));
      setDragUid(null);
      setDropAt(null);
    },
    end() {
      setDragUid(null);
      setDropAt(null);
    },
  };

  const addRoot = () => {
    const node = newNode();
    change([...tree, node]);
    open(node.uid);
  };

  const discard = async () => {
    const ok = await confirm({
      title: "Discard changes?",
      message: "All unsaved changes to this menu will be lost.",
      confirmLabel: "Discard",
      variant: "warning",
    });
    if (!ok) return;
    setTree(initial);
    setInvalidIds(new Set());
    onDirtyChange(false);
  };

  const save = async () => {
    const invalid = findInvalid(tree);
    if (invalid.length) {
      setInvalidIds(new Set(invalid));
      setOpenIds((s) => new Set([...s, ...invalid]));
      toast.error("Every menu item needs a label and a URL.");
      return;
    }
    setInvalidIds(new Set());
    setSaving(true);
    try {
      const res = await menusApi.save(menu.key, toApi(tree));
      toast.success(res.message ?? "Menu saved");
      onDirtyChange(false);
      queryClient.setQueryData([QK.MENUS, menu.key], res.data);
      queryClient.invalidateQueries({ queryKey: [QK.MENUS, "list"] });
    } catch (err) {
      const fields = apiFieldErrors(err);
      toast.error(fields.items ?? apiErrorMessage(err, "Couldn't save menu"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={ListTree}
        title={menu.name}
        description={
          <>
            {count(tree)} item(s) · up to {MAX_DEPTH} levels{canEdit && " · drag to reorder or nest"} ·
            updated {timeAgo(menu.updated_at)}
            {dirty && <span className="text-warning ml-2 font-medium">● Unsaved changes</span>}
          </>
        }
        actions={
          canEdit && (
            <>
              {dirty && (
                <Button variant="ghost" leftIcon={RotateCcw} onClick={discard} disabled={saving}>
                  Discard changes
                </Button>
              )}
              <Button leftIcon={Save} loading={saving} disabled={!dirty} onClick={save}>
                Save menu
              </Button>
            </>
          )
        }
      />
      <div className="p-4 sm:p-5">
        {tree.length ? (
          <ul className="space-y-2">
            {tree.map((node, i) => (
              <MenuItemRow
                key={node.uid}
                node={node}
                path={[i]}
                readOnly={!canEdit}
                openIds={openIds}
                invalidIds={invalidIds}
                handlers={handlers}
                drag={drag}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ListTree}
            title="This menu is empty"
            description="Add links to pages, posts or external sites."
          />
        )}
        {canEdit && (
          <Button variant="secondary" leftIcon={Plus} className="mt-4" onClick={addRoot}>
            Add item
          </Button>
        )}
      </div>
    </Card>
  );
}
