"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Modal } from "@/app/admin/_components/ui/index";
import { useClickOutside } from "@/app/admin/_hooks/useClickOutside";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { numbersApi, type WaNumber } from "../../_lib/numbersApi";
import { useDashboard } from "../DashboardContext";

// The WhatsApp number switcher in the header. Each number is its own inbox, contacts, templates,
// campaigns and the rest; switching swaps the whole workspace to that number.

const STATUS = {
  connected: { dot: "bg-emerald-500", text: "Connected" },
  error: { dot: "bg-red-500", text: "Needs attention" },
  pending: { dot: "bg-amber-400", text: "Checking…" },
  not_connected: { dot: "bg-line-strong", text: "Not connected yet" },
} as const;

export function StatusDot({ status, className }: { status: WaNumber["status"]; className?: string }) {
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS[status].dot, className)} aria-hidden />;
}

export function numberSubtitle(n: WaNumber) {
  return n.status === "connected" && n.display_phone_number ? n.display_phone_number : STATUS[n.status].text;
}

/** A coloured initial so numbers are told apart at a glance (not by colour alone: the name is beside it). */
export function NumberBadge({ n, size = 28 }: { n: Pick<WaNumber, "id" | "label">; size?: number }) {
  const tones = [
    "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  ];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg text-xs font-bold",
        tones[n.id % tones.length]
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {n.label.trim().charAt(0).toUpperCase() || "#"}
    </span>
  );
}

export function AddNumberModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (n: WaNumber) => void;
}) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const close = () => {
    setLabel("");
    setError(undefined);
    onClose();
  };
  const submit = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const res = await numbersApi.create(label);
      toast.success(res.message ?? "Number added");
      setLabel("");
      onAdded(res.data);
    } catch (err) {
      if (err instanceof CustomerApiError) setError(err.errors.label);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title="Add a WhatsApp number"
      description="Each number gets its own inbox, contacts, templates, campaigns, chatbots and store. Your team is shared."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button leftIcon={Plus} loading={saving} disabled={!label.trim()} onClick={submit}>
            Add and connect
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void submit();
        }}
      >
        <Input
          name="number_label"
          label="Name"
          required
          autoFocus
          maxLength={60}
          placeholder="e.g. Support, Delhi store, Sales"
          hint="Only your team sees this name, in the number switcher."
          value={label}
          error={error}
          onChange={(e) => setLabel(e.target.value)}
        />
      </form>
    </Modal>
  );
}

export function NumberSwitcher({
  numbers,
  current,
  onSwitch,
}: {
  numbers: WaNumber[];
  current: WaNumber;
  onSwitch: (id: number, opts?: { to?: string }) => Promise<void>;
}) {
  const { me } = useDashboard();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const manager = me.role !== "agent";
  const elsewhere = numbers.filter((n) => !n.current).reduce((sum, n) => sum + n.unread, 0);

  const pick = async (n: WaNumber) => {
    if (n.current) {
      setOpen(false);
      return;
    }
    setBusy(n.id);
    try {
      await onSwitch(n.id);
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`WhatsApp number: ${current.label}. Switch number`}
        className={cn(
          "border-line hover:bg-hover flex h-8 max-w-[44vw] min-w-0 items-center gap-2 rounded-lg border pr-1.5 pl-2 text-left shadow-xs transition sm:max-w-64",
          current.status === "error" && "border-danger/40"
        )}
      >
        <StatusDot status={current.status} />
        <span className="text-fg min-w-0 flex-1 truncate text-xs font-semibold">{current.label}</span>
        {elsewhere > 0 && (
          <span
            className="bg-primary text-primary-fg rounded-full px-1.5 text-[10px] leading-4 font-bold"
            title={`${elsewhere} unread chat${elsewhere === 1 ? "" : "s"} on your other numbers`}
          >
            {elsewhere > 99 ? "99+" : elsewhere}
          </span>
        )}
        <ChevronsUpDown className="text-fg-faint h-3.5 w-3.5 shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="border-line bg-surface fixed inset-x-2 top-13 z-100 rounded-xl border p-1.5 shadow-xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-72"
        >
          <p className="text-fg-subtle px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide uppercase">
            WhatsApp numbers
          </p>
          <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {numbers.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitemradio"
                aria-checked={n.current}
                disabled={busy !== null}
                onClick={() => pick(n)}
                className={cn(
                  "hover:bg-hover flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition disabled:opacity-60",
                  n.current && "bg-primary-soft/50"
                )}
              >
                <NumberBadge n={n} />
                <span className="min-w-0 flex-1">
                  <span className="text-fg block truncate text-sm font-medium">{n.label}</span>
                  <span className="text-fg-subtle flex items-center gap-1.5 truncate text-xs">
                    <StatusDot status={n.status} className="h-1.5 w-1.5" />
                    {numberSubtitle(n)}
                  </span>
                </span>
                {n.unread > 0 && !n.current && (
                  <span className="bg-primary text-primary-fg rounded-full px-1.5 text-[10px] leading-4 font-bold">
                    {n.unread > 99 ? "99+" : n.unread}
                  </span>
                )}
                {n.current && <Check className="text-primary h-4 w-4 shrink-0" aria-label="In use" />}
              </button>
            ))}
          </div>
          <div className="bg-line my-1 h-px" />
          {manager && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAdding(true);
              }}
              className="text-fg-muted hover:bg-hover hover:text-fg flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition"
            >
              <Plus className="text-fg-faint h-4 w-4" /> Add a number
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(CUSTOMER_ROUTES.WHATSAPP());
            }}
            className="text-fg-muted hover:bg-hover hover:text-fg flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition"
          >
            <Settings2 className="text-fg-faint h-4 w-4" /> {manager ? "Manage numbers" : "WhatsApp setup"}
          </button>
        </div>
      )}

      <AddNumberModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(n) => {
          setAdding(false);
          void onSwitch(n.id, { to: CUSTOMER_ROUTES.WHATSAPP() });
        }}
      />
    </div>
  );
}
