"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, CardBody, Input, Modal } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { NUMBERS_QK, numbersApi, type WaNumber } from "../_lib/numbersApi";
import { CardHeader } from "./CardHeader";
import { useDashboard } from "./DashboardContext";
import { AddNumberModal, NumberBadge, StatusDot, numberSubtitle } from "./shell/NumberSwitcher";

function RenameModal({ number, onClose }: { number: WaNumber | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(number?.label ?? "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!number) return;
    setSaving(true);
    try {
      const res = await numbersApi.rename(number.id, label);
      toast.success(res.message ?? "Saved");
      await queryClient.invalidateQueries({ queryKey: NUMBERS_QK.LIST });
      onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) setError(err.errors.label);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={!!number}
      onClose={onClose}
      size="sm"
      title="Rename number"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!label.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void save();
        }}
      >
        <Input
          name="rename_label"
          label="Name"
          autoFocus
          maxLength={60}
          value={label}
          error={error}
          onChange={(e) => setLabel(e.target.value)}
        />
      </form>
    </Modal>
  );
}

function DeleteModal({ number, onClose }: { number: WaNumber | null; onClose: () => void }) {
  const { numbers, switchNumber } = useDashboard();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const remove = async () => {
    if (!number) return;
    setSaving(true);
    try {
      const res = await numbersApi.remove(number.id, confirm);
      toast.success(res.message ?? "Deleted");
      const main = numbers.find((n) => n.main);
      if (number.current && main) await switchNumber(main.id, { to: CUSTOMER_ROUTES.WHATSAPP() });
      else await queryClient.invalidateQueries({ queryKey: NUMBERS_QK.LIST });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={!!number}
      onClose={onClose}
      size="sm"
      title={`Delete ${number?.label ?? "number"}?`}
      description="This removes the number from ChatDesk with everything in it: chats, contacts, templates, campaigns, chatbots, automatic replies, AI agents, products and orders. It can't be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            leftIcon={Trash2}
            loading={saving}
            disabled={confirm.trim().toUpperCase() !== "DELETE"}
            onClick={remove}
          >
            Delete number
          </Button>
        </>
      }
    >
      <Input
        name="delete_confirm"
        label="Type DELETE to confirm"
        autoComplete="off"
        autoFocus
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
    </Modal>
  );
}

/** Every number of the workspace: switch, rename, add and delete (the rest of the page is the one in use). */
export function NumbersCard() {
  const { me, numbers, number, switchNumber } = useDashboard();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<WaNumber | null>(null);
  const [deleting, setDeleting] = useState<WaNumber | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const manager = me.role !== "agent";

  const go = async (n: WaNumber) => {
    setBusy(n.id);
    try {
      await switchNumber(n.id, { to: CUSTOMER_ROUTES.WHATSAPP() });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-5 max-w-6xl">
      <CardHeader
        title="Your numbers"
        description={
          numbers.length > 1
            ? `Each number has its own chats, contacts, templates, campaigns and store. You're setting up ${number.label} below.`
            : "Add more numbers to run, say, sales and support separately. Your team is shared; everything else stays with each number."
        }
        actions={
          manager && (
            <Button size="sm" leftIcon={Plus} onClick={() => setAdding(true)}>
              Add a number
            </Button>
          )
        }
      />
      <CardBody className="p-0">
        <ul className="divide-line divide-y">
          {numbers.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
              <NumberBadge n={n} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-fg flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{n.label}</span>
                  {n.main && <Badge tone="neutral">Main</Badge>}
                  {n.current && <Badge tone="brand">In use</Badge>}
                </p>
                <p className="text-fg-subtle mt-0.5 flex items-center gap-1.5 text-xs">
                  <StatusDot status={n.status} />
                  {numberSubtitle(n)}
                  {n.unread > 0 && ` · ${n.unread} unread`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!n.current && (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={ArrowRightLeft}
                    loading={busy === n.id}
                    onClick={() => go(n)}
                  >
                    Switch
                  </Button>
                )}
                {manager && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Pencil}
                    aria-label={`Rename ${n.label}`}
                    onClick={() => setRenaming(n)}
                  >
                    <span className="hidden sm:inline">Rename</span>
                  </Button>
                )}
                {me.role === "owner" && !n.main && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Trash2}
                    iconOnly
                    aria-label={`Delete ${n.label}`}
                    className="text-danger hover:text-danger"
                    onClick={() => setDeleting(n)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
      <AddNumberModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(n) => {
          setAdding(false);
          void switchNumber(n.id, { to: CUSTOMER_ROUTES.WHATSAPP() });
        }}
      />
      {renaming && <RenameModal number={renaming} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteModal number={deleting} onClose={() => setDeleting(null)} />}
    </Card>
  );
}
