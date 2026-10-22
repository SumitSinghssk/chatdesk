"use client";

import { createContext, useContext, useRef, type FormEventHandler, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Lock, RotateCcw, Save, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button, Section } from "@/app/admin/_components/ui/index";
import { useReportDirty } from "@/app/admin/_hooks/useDirtyClose";
import { settingsApi, type AllSettings, type SettingsGroup } from "@/app/admin/_lib/api/settingsApi";
import { cn } from "@/lib/utils";

import { QK } from "@/config/query-keys";
export interface TabProps<K extends SettingsGroup> {
  data: AllSettings[K];
  canEdit: boolean;
}

export const SettingsDirtyContext = createContext<{ current: boolean } | null>(null);

export function useSaveGroup<K extends SettingsGroup>(key: K) {
  const queryClient = useQueryClient();
  return async (payload: AllSettings[K]): Promise<AllSettings[K]> => {
    const res = await settingsApi.update(key, payload);
    queryClient.setQueryData<AllSettings>([QK.SETTINGS], (old) => (old ? { ...old, [key]: res.data } : old));
    toast.success(res.message ?? "Settings saved");
    return res.data;
  };
}

export function ReadOnlyNotice({
  children = "You can view these settings but not change them.",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="border-line bg-page text-fg-muted flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
      <Lock size={14} className="text-fg-subtle shrink-0" />
      {children}
    </div>
  );
}

export function SaveBar({
  dirty,
  submitting,
  onReset,
  label = "Save changes",
  note,
  onSave,
}: {
  dirty: boolean;
  submitting: boolean;
  onReset: () => void;
  label?: string;
  note?: ReactNode;
  onSave?: () => void;
}) {
  return (
    <div className="border-line bg-surface/90 sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm backdrop-blur-md">
      <p
        className={cn("flex min-w-0 items-center gap-1.5 text-xs", dirty ? "text-warning" : "text-fg-subtle")}
      >
        <Info size={14} className="shrink-0" />
        <span className="truncate">
          {dirty ? "You have unsaved changes." : (note ?? "Changes take effect as soon as you save.")}
        </span>
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" leftIcon={RotateCcw} disabled={!dirty || submitting} onClick={onReset}>
          Discard
        </Button>
        <Button
          type={onSave ? "button" : "submit"}
          onClick={onSave}
          leftIcon={Save}
          loading={submitting}
          disabled={!dirty}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}

export function SettingsForm({
  id,
  canEdit,
  dirty,
  submitting,
  onSubmit,
  onReset,
  note,
  saveLabel,
  children,
}: {
  id: string;
  canEdit: boolean;
  dirty: boolean;
  submitting: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onReset: () => void;
  note?: ReactNode;
  saveLabel?: string;
  children: ReactNode;
}) {
  const fallbackRef = useRef(false);
  useReportDirty(useContext(SettingsDirtyContext) ?? fallbackRef, canEdit && dirty);

  return (
    <form id={id} onSubmit={onSubmit} noValidate className="space-y-5">
      {!canEdit && <ReadOnlyNotice />}
      <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
        {children}
      </fieldset>
      {canEdit && (
        <SaveBar dirty={dirty} submitting={submitting} onReset={onReset} note={note} label={saveLabel} />
      )}
    </form>
  );
}

export function SettingsSection({
  title,
  description,
  icon,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Section title={title} description={description} icon={icon} actions={actions} className={className}>
      {children}
    </Section>
  );
}
