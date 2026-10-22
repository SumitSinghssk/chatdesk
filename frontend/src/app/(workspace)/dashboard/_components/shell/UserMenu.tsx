"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, MessageCircle, UserCircle, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/app/admin/_components/ui/index";
import { useClickOutside } from "@/app/admin/_hooks/useClickOutside";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { teamApi } from "../../_lib/teamApi";
import { useDashboard } from "../DashboardContext";

// Mirrors the admin UserMenu (header variant) for a signed-in business or team member.

const item =
  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-fg-muted transition hover:bg-hover hover:text-fg";
const ROLE_LABEL = { owner: "Owner", admin: "Admin", agent: "Agent" };

export function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const { me, setMe } = useDashboard();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const name = me.name || me.email || me.phone || "Your account";
  const workspace = me.workspace?.name || me.business_name || "Your business";
  const manager = me.role !== "agent";
  const away = me.availability === "away";

  const toggleAway = async () => {
    setSaving(true);
    try {
      const next = away ? "available" : "away";
      const res = await teamApi.availability(next);
      setMe({ ...me, availability: next });
      toast.success(res.message ?? "Saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="hover:bg-hover flex items-center gap-2 rounded-lg p-1 pr-1.5 text-left transition"
      >
        <span className="relative">
          <Avatar name={name} src={me.avatar} size={28} />
          <span
            className={cn(
              "ring-surface absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2",
              away ? "bg-amber-400" : "bg-emerald-500"
            )}
            aria-hidden
          />
        </span>
        <span className="hidden min-w-0 flex-1 xl:block">
          <span className="text-fg block truncate text-xs font-semibold">{name}</span>
          <span className="text-fg-subtle block truncate text-[11px]">
            {workspace} · {ROLE_LABEL[me.role] ?? me.role}
          </span>
        </span>
        <ChevronsUpDown className="text-fg-faint hidden h-4 w-4 xl:block" />
      </button>

      {open && (
        <div className="border-line bg-surface absolute top-full right-0 z-100 mt-2 w-64 rounded-xl border p-1.5 shadow-xl">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={name} src={me.avatar} size={36} />
            <div className="min-w-0">
              <p className="text-fg truncate text-sm font-semibold">{name}</p>
              <p className="text-fg-subtle truncate text-xs">
                {ROLE_LABEL[me.role] ?? me.role} at {workspace}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!away}
            disabled={saving}
            onClick={toggleAway}
            className={cn(item, "justify-between")}
          >
            <span className="flex items-center gap-2.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", away ? "bg-amber-400" : "bg-emerald-500")} />
              {away ? "Away: no new chats" : "Available for new chats"}
            </span>
            <span
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition",
                away ? "bg-line-strong" : "bg-primary"
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                  away ? "left-0.5" : "left-4.5"
                )}
              />
            </span>
          </button>
          <div className="bg-line my-1 h-px" />
          <Link href={CUSTOMER_ROUTES.ACCOUNT()} className={item} onClick={() => setOpen(false)}>
            <UserCircle className="text-fg-faint h-4 w-4" /> My account
          </Link>
          {manager && (
            <>
              <Link href={CUSTOMER_ROUTES.TEAM()} className={item} onClick={() => setOpen(false)}>
                <UsersRound className="text-fg-faint h-4 w-4" /> Team
              </Link>
              <Link href={CUSTOMER_ROUTES.WHATSAPP()} className={item} onClick={() => setOpen(false)}>
                <MessageCircle className="text-fg-faint h-4 w-4" /> WhatsApp setup
              </Link>
            </>
          )}
          <div className="bg-line my-1 h-px" />
          <button
            type="button"
            onClick={onSignOut}
            className={cn(item, "text-danger hover:bg-danger-soft hover:text-danger font-medium")}
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
