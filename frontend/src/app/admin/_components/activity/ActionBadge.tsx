import { Badge, type BadgeTone } from "@/app/admin/_components/ui/index";
import { titleCase } from "@/lib/utils";

const TONES: Record<string, BadgeTone> = {
  created: "green",
  restored: "green",
  imported: "green",
  items_added: "green",
  two_factor_enabled: "green",
  login: "blue",
  uploaded: "blue",
  exported: "blue",
  downloaded: "blue",
  logout: "default",
  updated: "purple",
  item_updated: "purple",
  status_changed: "purple",
  cover_changed: "purple",
  reordered: "purple",
  assigned: "purple",
  deleted: "red",
  items_removed: "red",
  bulk_delete: "red",
  force_deleted: "red",
  cleared: "red",
  locked: "red",
  two_factor_disabled: "red",
  login_failed: "yellow",
  password_changed: "yellow",
  password_reset: "yellow",
  sessions_revoked: "yellow",
  session_revoked: "yellow",
};

const LABELS: Record<string, string> = {
  status_changed: "Status changed",
  items_added: "Items added",
  items_removed: "Items removed",
  item_updated: "Item updated",
  cover_changed: "Cover changed",
  force_deleted: "Deleted forever",
  two_factor_enabled: "2FA on",
  two_factor_disabled: "2FA off",
  two_factor_reset: "2FA reset",
  two_factor_recovery_used: "Recovery code used",
  two_factor_recovery_regenerated: "New recovery codes",
};

export function actionLabel(action: string) {
  return LABELS[action] ?? titleCase(action);
}

export function ActionBadge({ action }: { action: string }) {
  return <Badge tone={TONES[action] ?? "default"}>{actionLabel(action)}</Badge>;
}
