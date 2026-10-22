"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ListTree } from "lucide-react";

import { AccessDenied, Card, EmptyState, Spinner, Tabs } from "@/app/admin/_components/ui/index";
import { HistoryButton } from "@/app/admin/_components/activity";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { menusApi } from "@/app/admin/_lib/api/menusApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";

import { MenuEditor } from "./MenuEditor";

import { QK } from "@/config/query-keys";
export default function Menus() {
  const can = usePermissions();
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dirty, setDirty] = useState(false);

  const { data: menus, isLoading } = useQuery({ queryKey: [QK.MENUS, "list"], queryFn: menusApi.list });
  const active = searchParams.get("menu") || menus?.[0]?.key || "";
  const {
    data: menu,
    dataUpdatedAt,
    isLoading: menuLoading,
  } = useQuery({
    queryKey: [QK.MENUS, active],
    queryFn: () => menusApi.get(active),
    enabled: !!active,
  });

  if (!can(PERM.MENUS_VIEW)) return <AccessDenied />;

  const switchTo = async (key: string) => {
    if (key === active) return;
    if (dirty) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "You have unsaved changes to this menu. Switching will discard them.",
        confirmLabel: "Discard",
        variant: "warning",
      });
      if (!ok) return;
    }
    setDirty(false);
    router.replace(`${pathname}?menu=${key}`, { scroll: false });
  };

  return (
    <>
      <h1 className="sr-only">Menus</h1>

      {isLoading ? (
        <Spinner />
      ) : !menus?.length ? (
        <Card>
          <EmptyState
            icon={ListTree}
            title="No menus defined"
            description="Menus are created by the website configuration."
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-end gap-2">
            <Tabs
              className="min-w-0 flex-1"
              value={active}
              onChange={switchTo}
              tabs={menus.map((m) => ({ value: m.key, label: m.name, count: m.items_count }))}
            />
            {menu && (
              <HistoryButton subject={{ type: "menu", id: menu.id, label: menu.name }} className="mb-1" />
            )}
          </div>
          {menuLoading || !menu ? (
            <Spinner />
          ) : (
            <MenuEditor
              key={`${menu.key}-${dataUpdatedAt}`}
              menu={menu}
              canEdit={can(PERM.MENUS_UPDATE)}
              onDirtyChange={setDirty}
            />
          )}
        </>
      )}
    </>
  );
}
