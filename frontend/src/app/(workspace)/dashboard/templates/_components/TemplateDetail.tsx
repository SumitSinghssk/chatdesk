"use client";

import Link from "next/link";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Modal } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { ChatBackdrop, TemplateBubble } from "../../_components/whatsapp/TemplatePreview";
import { templatesApi, type Template } from "../../_lib/templatesApi";
import { categoryLabel, languageName, QUALITY, statusOf } from "./labels";

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border-line rounded-lg border px-3 py-2.5">
      <p className="text-fg-subtle text-xs">{label}</p>
      <p className="text-fg tabular text-lg font-semibold">{value}</p>
      {hint && <p className="text-fg-faint text-[11px]">{hint}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-fg-subtle shrink-0">{label}</dt>
      <dd className="text-fg min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

/** Sample values for the preview: the template's own examples, or 123456 for a login code. */
export function previewValues(t: Template) {
  if (t.category === "authentication") return { body: { "1": "123456" } };
  const headerVar = t.params.header[0];
  return {
    header: headerVar && t.form.header.example ? { [headerVar]: t.form.header.example } : {},
    body: t.form.examples,
  };
}

export function TemplateDetail({
  template,
  onClose,
  onDelete,
}: {
  template: Template | null;
  onClose: () => void;
  onDelete: (t: Template) => void;
}) {
  const t = template;
  const status = t ? statusOf(t.status) : null;
  const quality = t?.quality ? (QUALITY[t.quality] ?? null) : null;

  return (
    <Modal
      open={!!t}
      onClose={onClose}
      variant="drawer"
      size="lg"
      title={t ? <span className="font-mono text-base">{t.name}</span> : ""}
      footer={
        t && (
          <>
            <Button
              variant="ghost"
              leftIcon={Trash2}
              className="text-danger mr-auto"
              onClick={() => onDelete(t)}
            >
              Delete
            </Button>
            <Link href={CUSTOMER_ROUTES.TEMPLATE_NEW({ from: t.id })}>
              <Button variant="secondary" leftIcon={Copy}>
                Duplicate
              </Button>
            </Link>
            {t.editable && (
              <Link href={CUSTOMER_ROUTES.TEMPLATE_EDIT(t.id)}>
                <Button leftIcon={Pencil}>Edit</Button>
              </Link>
            )}
          </>
        )
      }
    >
      {t && status && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            <Badge>{categoryLabel(t.category)}</Badge>
            <Badge>{languageName(t.language)}</Badge>
            {quality && <Badge tone={quality.tone}>Quality: {quality.label}</Badge>}
          </div>

          <div
            className={
              t.status === "rejected" || t.status === "disabled"
                ? "border-danger/30 bg-danger-soft text-danger rounded-lg border px-3 py-2.5 text-sm"
                : "border-line bg-page text-fg-subtle rounded-lg border px-3 py-2.5 text-sm"
            }
          >
            {t.rejected_reason && (
              <p className="font-semibold">Reason: {t.rejected_reason.replace(/_/g, " ").toLowerCase()}</p>
            )}
            <p>{status.hint}</p>
          </div>

          <ChatBackdrop className="flex justify-center py-6">
            <TemplateBubble
              template={t.form}
              values={previewValues(t)}
              highlight={false}
              media={
                t.sample
                  ? {
                      url: templatesApi.sampleUrl(t.sample.path),
                      mime: t.sample.mime,
                      filename: t.sample.filename,
                    }
                  : null
              }
            />
          </ChatBackdrop>

          <div>
            <p className="text-fg mb-2 text-sm font-semibold">Performance</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Sent"
                value={t.stats.sent}
                hint={t.stats.last_sent_at ? `last ${timeAgo(t.stats.last_sent_at)}` : "not sent yet"}
              />
              <Stat
                label="Delivered"
                value={pct(t.stats.delivered, t.stats.sent)}
                hint={`${t.stats.delivered} messages`}
              />
              <Stat label="Read" value={pct(t.stats.read, t.stats.sent)} hint={`${t.stats.read} messages`} />
              <Stat label="Failed" value={t.stats.failed} hint={pct(t.stats.failed, t.stats.sent)} />
            </div>
          </div>

          <dl className="divide-line divide-y">
            <Row label="Variables">
              {t.params.body.length + t.params.header.length
                ? [...t.params.header, ...t.params.body].map((v) => `{{${v}}}`).join(" ")
                : "None"}
            </Row>
            <Row label="Made in">{t.source === "meta" ? "WhatsApp Manager" : "ChatDesk"}</Row>
            {t.submitted_at && <Row label="Submitted">{formatDateTime(t.submitted_at)}</Row>}
            {t.status_changed_at && <Row label="Status changed">{formatDateTime(t.status_changed_at)}</Row>}
            <Row label="Last updated">{formatDateTime(t.updated_at)}</Row>
            {t.meta_id && (
              <Row label="Meta template ID">
                <button
                  type="button"
                  className="hover:text-primary font-mono text-xs"
                  onClick={() => {
                    void navigator.clipboard?.writeText(t.meta_id!);
                    toast.success("Copied");
                  }}
                >
                  {t.meta_id}
                </button>
              </Row>
            )}
          </dl>
        </div>
      )}
    </Modal>
  );
}
