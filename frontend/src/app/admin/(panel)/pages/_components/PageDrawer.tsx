"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useController, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Button,
  EmptyState,
  ImageField,
  Input,
  Modal,
  Section,
  Skeleton,
  StatusBadge,
} from "@/app/admin/_components/ui/index";
import { RichTextEditor } from "@/app/admin/_components/ui/RichTextEditor";
import { useDirtyClose, useReportDirty } from "@/app/admin/_hooks/useDirtyClose";
import type { DrawerValue } from "@/app/admin/_hooks/useUrlDrawer";
import { pagesApi, type Page } from "@/app/admin/_lib/api/pagesApi";
import { apiErrorMessage, apiErrorStatus } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";
import { slugify, stripHtml, toDateTimeLocal } from "@/lib/utils";

import { EditorFooter } from "@/app/admin/(panel)/blogs/_components/EditorFooter";
import { PublishCard } from "@/app/admin/(panel)/blogs/_components/PublishCard";
import { SeoLinkCard } from "@/app/admin/(panel)/blogs/_components/SeoLinkCard";
import { useUnsavedChangesGuard } from "@/app/admin/(panel)/blogs/_components/useUnsavedChangesGuard";

import { QK } from "@/config/query-keys";
const schema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(255),
  slug: z.string().trim().max(280),
  content: z.string(),
  featured_image: z.string().nullable(),
  status: z.enum(["draft", "published"]),
  published_at: z.string(),
});
type Values = z.infer<typeof schema>;

const toValues = (page?: Page | null): Values => ({
  title: page?.title ?? "",
  slug: page?.slug ?? "",
  content: page?.content ?? "",
  featured_image: page?.featured_image ?? null,
  status: page?.status ?? "draft",
  published_at: toDateTimeLocal(page?.published_at),
});

export function PageDrawer({
  value,
  onClose,
  onCreated,
}: {
  value: DrawerValue;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { dirtyRef, requestClose, discard } = useDirtyClose(onClose, { guardBack: true });

  const id = typeof value === "number" ? value : null;
  const allowed = value === "new" ? can(PERM.PAGES_CREATE) : can(PERM.PAGES_VIEW);
  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: [QK.PAGES, "detail", id],
    queryFn: () => pagesApi.get(id!),
    enabled: !!id && allowed,
    retry: (count, err) => apiErrorStatus(err) !== 404 && count < 2,
  });

  const ready = value === "new" || (!!page && page.id === id);
  const current = value === "new" ? null : (page ?? null);
  const canSave = value === "new" || can(PERM.PAGES_UPDATE);

  const remove = async () => {
    if (!current) return;
    const ok = await confirm({
      title: "Delete page?",
      message: (
        <>
          <b>{current.title}</b> will be moved to the trash. You can restore it later.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await pagesApi.remove(current.id);
      toast.success(res.message ?? "Page deleted");
      queryClient.removeQueries({ queryKey: [QK.PAGES, "detail", current.id] });
      queryClient.invalidateQueries({ queryKey: [QK.PAGES] });
      await discard();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete page"));
    }
  };

  return (
    <Modal
      open={value !== null && allowed}
      onClose={requestClose}
      variant="drawer"
      size="2xl"
      title={
        current ? (
          <span className="flex flex-wrap items-center gap-2">
            Edit page <StatusBadge status={current.status} />
          </span>
        ) : value === "new" ? (
          "New page"
        ) : (
          "Page"
        )
      }
      description={
        current ? current.title : value === "new" ? "Add a static page such as About or Terms." : undefined
      }
      headerActions={
        current &&
        can(PERM.PAGES_DELETE) && (
          <Button size="sm" variant="danger-outline" leftIcon={Trash2} onClick={remove}>
            Delete
          </Button>
        )
      }
      bodyClassName="bg-page p-0"
    >
      {id && error ? (
        <EmptyState
          title={apiErrorStatus(error) === 404 ? "Page not found" : "Couldn't load this page"}
          description="It may have been deleted or moved to the trash."
          action={
            <Button variant="secondary" onClick={onClose}>
              Back to pages
            </Button>
          }
        />
      ) : isLoading || !ready ? (
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy>
          <Skeleton className="h-[28rem]" />
          <div className="space-y-5">
            <Skeleton className="h-56" />
            <Skeleton className="h-40" />
          </div>
        </div>
      ) : (
        <Editor
          key={current?.id ?? "new"}
          page={current}
          canSave={canSave}
          dirtyRef={dirtyRef}
          onCancel={requestClose}
          onCreated={(created) => {
            queryClient.setQueryData([QK.PAGES, "detail", created.id], created);
            void discard().then(() => onCreated(created.id));
          }}
        />
      )}
    </Modal>
  );
}

function Editor({
  page,
  canSave,
  dirtyRef,
  onCancel,
  onCreated,
}: {
  page: Page | null;
  canSave: boolean;
  dirtyRef: { current: boolean };
  onCancel: () => void;
  onCreated: (page: Page) => void;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(page);
  const [slugTouched, setSlugTouched] = useState(!!page);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(page) });
  const { register, handleSubmit, reset, control, setValue, formState, setError } = form;
  const errors = formState.errors;
  const slug = useWatch({ control, name: "slug" });

  const { field: statusField } = useController({ control, name: "status" });
  const { field: publishedAtField } = useController({ control, name: "published_at" });

  useUnsavedChangesGuard(formState.isDirty);
  useReportDirty(dirtyRef, formState.isDirty);

  const onSubmit = handleSubmit(async (values) => {
    const payload = emptyToNull(values);
    try {
      const res = saved ? await pagesApi.update(saved.id, payload) : await pagesApi.create(payload);
      toast.success(res.message ?? "Saved");
      queryClient.invalidateQueries({ queryKey: [QK.PAGES], predicate: (q) => q.queryKey[1] !== "detail" });
      if (!saved) {
        reset(values);
        onCreated(res.data);
        return;
      }
      queryClient.setQueryData([QK.PAGES, "detail", res.data.id], res.data);
      setSaved(res.data);
      setSlugTouched(true);
      reset(toValues(res.data));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save page");
    }
  });

  const isPublished = saved?.status === "published";

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-full flex-col">
      <div className="grid flex-1 items-start gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Section title="Content">
            <Input
              label="Title"
              required
              autoFocus={!saved}
              error={errors.title?.message}
              disabled={!canSave}
              {...register("title", {
                onChange: (e) =>
                  !slugTouched && setValue("slug", slugify(e.target.value), { shouldDirty: true }),
              })}
            />
            <Input
              label="Slug"
              hint={<>URL: /{slug || "your-page-slug"}</>}
              error={errors.slug?.message}
              disabled={!canSave}
              {...register("slug", { onChange: (e) => setSlugTouched(e.target.value !== "") })}
            />
            <Controller
              control={control}
              name="content"
              render={({ field }) => (
                <RichTextEditor
                  label="Body"
                  value={field.value}
                  onChange={field.onChange}
                  folder="pages"
                  error={errors.content?.message}
                />
              )}
            />
          </Section>
        </div>

        <aside className="space-y-5">
          <PublishCard
            statusField={statusField}
            publishedAtField={publishedAtField}
            errors={{ status: errors.status?.message, published_at: errors.published_at?.message }}
            canSave={canSave}
            isEdit={!!saved}
            author={saved?.author?.name}
            updatedAt={saved?.updated_at}
            readOnlyNote={
              !canSave && <p className="text-fg-subtle text-xs">You have read-only access to this page.</p>
            }
          />

          <SeoLinkCard
            path={saved ? `/${saved.slug}` : null}
            label={`Page: ${saved?.title ?? ""}`}
            prefill={
              saved
                ? {
                    meta_title: saved.meta_title || saved.title,
                    meta_description: (saved.meta_description || stripHtml(saved.content)).slice(0, 160),
                    og_image: saved.featured_image,
                  }
                : undefined
            }
          />

          <Section title="Page banner" description="Shown at the top of the page.">
            <Controller
              control={control}
              name="featured_image"
              render={({ field }) => (
                <ImageField
                  value={field.value}
                  onChange={field.onChange}
                  folder="pages"
                  error={errors.featured_image?.message}
                />
              )}
            />
          </Section>
        </aside>
      </div>

      <EditorFooter
        dirty={formState.isDirty}
        isEdit={!!saved}
        canSave={canSave}
        submitting={formState.isSubmitting}
        viewUrl={isPublished ? `/${saved!.slug}` : null}
        onCancel={onCancel}
      />
    </form>
  );
}
