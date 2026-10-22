"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  ImageIcon,
  MapPin,
  Paperclip,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { ChatBackdrop, TemplateBubble } from "../../_components/whatsapp/TemplatePreview";
import { INBOX_QK, inboxApi, type SendTemplateInput } from "../../_lib/inboxApi";
import { templatesApi, type Template } from "../../_lib/templatesApi";
import { SAMPLE_ACCEPT } from "../../templates/_components/editor/HeaderField";
import { categoryLabel, languageName } from "../../templates/_components/labels";

const HEADER_ICONS: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  document: FileText,
  location: MapPin,
};

interface Values {
  header: Record<string, string>;
  body: Record<string, string>;
  buttons: Record<number, string>;
  location: { latitude: string; longitude: string; name: string; address: string };
  media: { key: string; url: string; filename: string } | null;
}

const empty = (t: Template): Values => ({
  header: {},
  body: {},
  // coupon codes start with the sample; link endings are per customer
  buttons: Object.fromEntries(
    t.params.buttons.filter((b) => b.type === "copy_code").map((b) => [b.index, b.example ?? ""])
  ),
  location: { latitude: "", longitude: "", name: "", address: "" },
  media: null,
});

export function TemplateModal({
  open,
  contactName,
  onClose,
  onSend,
}: {
  open: boolean;
  contactName: string;
  onClose: () => void;
  onSend: (input: SendTemplateInput) => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    enabled: open,
    staleTime: 60_000,
  });

  const templates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((t) => !q || `${t.name} ${t.form.body}`.toLowerCase().includes(q));
  }, [data, search]);
  const selected = (data ?? []).find((t) => t.id === selectedId) ?? null;
  const v = selected && values;

  const choose = (t: Template) => {
    setSelectedId(t.id);
    setValues(empty(t));
  };
  const set = (patch: Partial<Values>) => setValues((cur) => (cur ? { ...cur, ...patch } : cur));

  const refresh = async () => {
    setRefreshing(true);
    try {
      queryClient.setQueryData(INBOX_QK.TEMPLATES, (await inboxApi.templates(true)).data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const upload = async (file: File) => {
    if (!selected) return;
    setUploading(true);
    try {
      const res = await templatesApi.uploadSample(
        file,
        selected.form.header.format as "image" | "video" | "document"
      );
      set({ media: { key: res.key, url: URL.createObjectURL(file), filename: res.filename } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const format = selected?.form.header.format ?? "none";
  const needsLocation = format === "location";
  const complete =
    !!selected &&
    !!v &&
    selected.params.header.every((n) => v.header[n]?.trim()) &&
    selected.params.body.every((n) => v.body[n]?.trim()) &&
    selected.params.buttons.every((b) => v.buttons[b.index]?.trim()) &&
    (!needsLocation || (!!v.location.latitude && !!v.location.longitude)) &&
    (!["image", "video", "document"].includes(format) || !!selected.sample || !!v.media);

  const send = async () => {
    if (!selected || !v || !complete) return;
    setSending(true);
    const ok = await onSend({
      name: selected.name,
      language: selected.language,
      header_params: selected.params.header.map((n) => ({ text: v.header[n].trim() })),
      body_params: selected.params.body.map((n) => ({ text: v.body[n].trim() })),
      button_params: selected.params.buttons.map((b) => ({
        index: b.index,
        text: v.buttons[b.index].trim(),
      })),
      header_media: v.media?.key ?? null,
      location: needsLocation
        ? {
            latitude: Number(v.location.latitude),
            longitude: Number(v.location.longitude),
            name: v.location.name || undefined,
            address: v.location.address || undefined,
          }
        : null,
    });
    setSending(false);
    if (ok) {
      setSelectedId(null);
      onClose();
    }
  };

  const mediaPreview = selected
    ? v?.media
      ? { url: v.media.url, filename: v.media.filename }
      : selected.sample
        ? { url: templatesApi.sampleUrl(selected.sample.path), filename: selected.sample.filename }
        : null
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Send a template"
      description={`Approved WhatsApp templates can be sent to ${contactName} at any time, even after the 24-hour window.`}
      headerActions={
        <Button variant="ghost" size="sm" leftIcon={RefreshCw} loading={refreshing} onClick={refresh}>
          Refresh
        </Button>
      }
      footer={
        <>
          <Link
            href={CUSTOMER_ROUTES.TEMPLATES()}
            className="text-fg-subtle hover:text-primary mr-auto flex items-center gap-1.5 text-sm"
          >
            <Settings2 className="h-4 w-4" /> Manage templates
          </Link>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon={SendHorizontal} disabled={!complete} loading={sending} onClick={send}>
            Send template
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorBanner message={errorMessage(error)} />
      ) : (
        <div className="grid min-h-80 gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <Input
              leftIcon={Search}
              placeholder="Search templates"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search templates"
            />
            <div className="border-line max-h-[26rem] min-h-0 flex-1 overflow-y-auto rounded-lg border">
              {isLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : templates.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={search ? "No templates match" : "No approved templates"}
                  description={
                    search ? "Try another word." : "Create one in Templates. Approved ones appear here."
                  }
                  action={
                    !search && (
                      <Link href={CUSTOMER_ROUTES.TEMPLATE_NEW()}>
                        <Button size="sm">New template</Button>
                      </Link>
                    )
                  }
                />
              ) : (
                templates.map((t) => {
                  const Icon = HEADER_ICONS[t.form.header.format];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => choose(t)}
                      aria-pressed={t.id === selectedId}
                      className={cn(
                        "border-line/70 block w-full border-b px-3 py-2.5 text-left transition last:border-b-0",
                        t.id === selectedId ? "bg-primary-soft" : "hover:bg-hover"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {Icon && <Icon className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />}
                        <span className="text-fg min-w-0 flex-1 truncate font-mono text-[13px] font-medium">
                          {t.name}
                        </span>
                        <Badge>{languageName(t.language)}</Badge>
                      </span>
                      <span className="text-fg-subtle mt-0.5 line-clamp-2 block text-xs">
                        <span className="text-fg-faint">{categoryLabel(t.category)} · </span>
                        {t.category === "authentication"
                          ? "Verification code"
                          : t.form.body.replace(/[*_~`]/g, "")}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="min-w-0">
            {!selected || !v ? (
              <div className="border-line text-fg-subtle flex h-full min-h-60 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
                Pick a template to preview it and fill in its details.
              </div>
            ) : (
              <div className="space-y-4">
                <ChatBackdrop className="flex justify-center">
                  <TemplateBubble
                    template={selected.form}
                    values={{ header: v.header, body: v.body }}
                    media={mediaPreview}
                  />
                </ChatBackdrop>

                {["image", "video", "document"].includes(format) && (
                  <div className="border-line bg-page flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <Paperclip className="text-fg-faint h-4 w-4 shrink-0" />
                    <span className="text-fg-subtle min-w-0 flex-1 truncate">
                      {v.media
                        ? v.media.filename
                        : selected.sample
                          ? `Template ${format}: ${selected.sample.filename ?? "sample"}`
                          : `Choose a ${format === "document" ? "PDF" : format} to send`}
                    </span>
                    {v.media && (
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        leftIcon={X}
                        aria-label="Use the template's file"
                        onClick={() => set({ media: null })}
                      />
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept={SAMPLE_ACCEPT[format]}
                      aria-label="Header file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      {selected.sample || v.media ? "Change" : "Choose file"}
                    </Button>
                  </div>
                )}

                {needsLocation && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      name="location_latitude"
                      label="Latitude"
                      inputMode="decimal"
                      placeholder="28.6139"
                      value={v.location.latitude}
                      onChange={(e) => set({ location: { ...v.location, latitude: e.target.value } })}
                    />
                    <Input
                      name="location_longitude"
                      label="Longitude"
                      inputMode="decimal"
                      placeholder="77.2090"
                      value={v.location.longitude}
                      onChange={(e) => set({ location: { ...v.location, longitude: e.target.value } })}
                    />
                    <Input
                      name="location_name"
                      label="Place name"
                      placeholder="Our store"
                      value={v.location.name}
                      onChange={(e) => set({ location: { ...v.location, name: e.target.value } })}
                    />
                    <Input
                      name="location_address"
                      label="Address"
                      value={v.location.address}
                      onChange={(e) => set({ location: { ...v.location, address: e.target.value } })}
                    />
                  </div>
                )}

                {selected.params.header.map((name) => (
                  <Input
                    key={`h-${name}`}
                    label={`Header {{${name}}}`}
                    name={`header_param_${name}`}
                    value={v.header[name] ?? ""}
                    placeholder={selected.form.header.example ?? undefined}
                    onChange={(e) => set({ header: { ...v.header, [name]: e.target.value } })}
                  />
                ))}
                {selected.params.body.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selected.params.body.map((name, i) => (
                      <Input
                        key={`b-${name}`}
                        label={
                          selected.category === "authentication"
                            ? "Verification code"
                            : `Variable {{${name}}}`
                        }
                        name={`body_param_${i}`}
                        placeholder={
                          selected.category === "authentication"
                            ? "123456"
                            : i === 0 && /^(1|.*name.*)$/.test(name)
                              ? contactName
                              : selected.form.examples[name]
                        }
                        value={v.body[name] ?? ""}
                        onChange={(e) => set({ body: { ...v.body, [name]: e.target.value } })}
                      />
                    ))}
                  </div>
                )}
                {selected.params.buttons.map((b) => (
                  <Input
                    key={`btn-${b.index}`}
                    name={`button_param_${b.index}`}
                    label={b.type === "copy_code" ? "Offer code" : `Link ending for “${b.label}”`}
                    placeholder={b.example ?? undefined}
                    value={v.buttons[b.index] ?? ""}
                    onChange={(e) => set({ buttons: { ...v.buttons, [b.index]: e.target.value } })}
                    hint={
                      b.type === "url"
                        ? (selected.form.buttons[b.index]?.url ?? "").replace(
                            "{{1}}",
                            v.buttons[b.index] || "…"
                          )
                        : undefined
                    }
                  />
                ))}
                {!selected.params.body.length &&
                  !selected.params.header.length &&
                  !selected.params.buttons.length &&
                  !needsLocation && (
                    <p className="text-fg-subtle text-xs">
                      This template has nothing to fill in. It&apos;s ready to send.
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
