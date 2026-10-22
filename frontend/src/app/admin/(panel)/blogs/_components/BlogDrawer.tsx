"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useController, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FolderTree, MessagesSquare, Trash2 } from "lucide-react";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Button,
  Checkbox,
  EmptyState,
  ImageField,
  Input,
  Modal,
  Section,
  Skeleton,
  Spinner,
  StatusBadge,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { RichTextEditor } from "@/app/admin/_components/ui/RichTextEditor";
import { useDirtyClose, useReportDirty } from "@/app/admin/_hooks/useDirtyClose";
import type { DrawerValue } from "@/app/admin/_hooks/useUrlDrawer";
import { blogCategoriesApi } from "@/app/admin/_lib/api/blogCategoriesApi";
import { blogsApi, type Blog } from "@/app/admin/_lib/api/blogsApi";
import { apiErrorMessage, apiErrorStatus } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";
import { slugify, stripHtml, toDateTimeLocal } from "@/lib/utils";

import { LabelWithCount } from "./CharCount";
import { EditorFooter } from "./EditorFooter";
import { PublishCard } from "./PublishCard";
import { SeoLinkCard } from "./SeoLinkCard";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

import { ADMIN_ROUTES } from "@/config/routes";
import { WEBSITE_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
const schema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(255),
  slug: z.string().trim().max(280),
  excerpt: z.string().max(500, "Keep the excerpt under 500 characters"),
  content: z.string(),
  featured_image: z.string().nullable(),
  status: z.enum(["draft", "published"]),
  published_at: z.string(),
  category_ids: z.array(z.number()),
  comments_enabled: z.boolean(),
});
type Values = z.infer<typeof schema>;

const toValues = (blog?: Blog | null): Values => ({
  title: blog?.title ?? "",
  slug: blog?.slug ?? "",
  excerpt: blog?.excerpt ?? "",
  content: blog?.content ?? "",
  featured_image: blog?.featured_image ?? null,
  status: blog?.status ?? "draft",
  published_at: toDateTimeLocal(blog?.published_at),
  category_ids: blog?.category_ids ?? [],
  comments_enabled: blog?.comments_enabled ?? true,
});

export function BlogDrawer({
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
  const allowed = value === "new" ? can(PERM.BLOGS_CREATE) : can(PERM.BLOGS_VIEW);
  const {
    data: blog,
    isLoading,
    error,
  } = useQuery({
    queryKey: [QK.BLOGS, "detail", id],
    queryFn: () => blogsApi.get(id!),
    enabled: !!id && allowed,
    retry: (count, err) => apiErrorStatus(err) !== 404 && count < 2,
  });

  const ready = value === "new" || (!!blog && blog.id === id);
  const current = value === "new" ? null : (blog ?? null);
  const canSave = value === "new" || can(PERM.BLOGS_UPDATE);

  const remove = async () => {
    if (!current) return;
    const ok = await confirm({
      title: "Delete post?",
      message: (
        <>
          <b>{current.title}</b> will be moved to the trash. You can restore it later.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await blogsApi.remove(current.id);
      toast.success(res.message ?? "Post deleted");
      queryClient.removeQueries({ queryKey: [QK.BLOGS, "detail", current.id] });
      queryClient.invalidateQueries({ queryKey: [QK.BLOGS] });
      await discard();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete post"));
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
            Edit post <StatusBadge status={current.status} />
          </span>
        ) : value === "new" ? (
          "New post"
        ) : (
          "Post"
        )
      }
      description={
        current ? current.title : value === "new" ? "Draft a new article for the blog." : undefined
      }
      headerActions={
        current &&
        can(PERM.BLOGS_DELETE) && (
          <Button size="sm" variant="danger-outline" leftIcon={Trash2} onClick={remove}>
            Delete
          </Button>
        )
      }
      bodyClassName="bg-page p-0"
    >
      {id && error ? (
        <EmptyState
          title={apiErrorStatus(error) === 404 ? "Post not found" : "Couldn't load this post"}
          description="It may have been deleted or moved to the trash."
          action={
            <Button variant="secondary" onClick={onClose}>
              Back to posts
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
          blog={current}
          canSave={canSave}
          dirtyRef={dirtyRef}
          onCancel={requestClose}
          onCreated={(created) => {
            queryClient.setQueryData([QK.BLOGS, "detail", created.id], created);
            void discard().then(() => onCreated(created.id));
          }}
        />
      )}
    </Modal>
  );
}

function Editor({
  blog,
  canSave,
  dirtyRef,
  onCancel,
  onCreated,
}: {
  blog: Blog | null;
  canSave: boolean;
  dirtyRef: { current: boolean };
  onCancel: () => void;
  onCreated: (blog: Blog) => void;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(blog);
  const [slugTouched, setSlugTouched] = useState(!!blog);

  const canViewComments = usePermissions()(PERM.COMMENTS_VIEW);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(blog) });
  const { register, handleSubmit, reset, control, setValue, formState, setError } = form;
  const errors = formState.errors;
  const [slug, excerpt] = useWatch({ control, name: ["slug", "excerpt"] });

  const { field: statusField } = useController({ control, name: "status" });
  const { field: publishedAtField } = useController({ control, name: "published_at" });

  useUnsavedChangesGuard(formState.isDirty);
  useReportDirty(dirtyRef, formState.isDirty);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: [QK.BLOG_CATEGORIES, "all"],
    queryFn: () => blogCategoriesApi.all(),
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload = emptyToNull(values);
    try {
      const res = saved ? await blogsApi.update(saved.id, payload) : await blogsApi.create(payload);
      toast.success(res.message ?? "Saved");
      queryClient.invalidateQueries({ queryKey: [QK.BLOGS], predicate: (q) => q.queryKey[1] !== "detail" });
      if (!saved) {
        reset(values);
        onCreated(res.data);
        return;
      }
      queryClient.setQueryData([QK.BLOGS, "detail", res.data.id], res.data);
      setSaved(res.data);
      setSlugTouched(true);
      reset(toValues(res.data));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save post");
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
              hint={<>URL: /blog/{slug || "your-post-slug"}</>}
              error={errors.slug?.message}
              disabled={!canSave}
              {...register("slug", { onChange: (e) => setSlugTouched(e.target.value !== "") })}
            />
            <Textarea
              label={<LabelWithCount label="Excerpt" count={excerpt.length} max={500} />}
              rows={3}
              placeholder="A short summary shown on listing pages and in search results."
              error={errors.excerpt?.message}
              disabled={!canSave}
              {...register("excerpt")}
            />
            <Controller
              control={control}
              name="content"
              render={({ field }) => (
                <RichTextEditor
                  label="Body"
                  value={field.value}
                  onChange={field.onChange}
                  folder="blogs"
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
              !canSave && <p className="text-fg-subtle text-xs">You have read-only access to this post.</p>
            }
          />

          <SeoLinkCard
            path={saved ? WEBSITE_ROUTES.BLOG_POST(saved.slug) : null}
            label={`Blog: ${saved?.title ?? ""}`}
            prefill={
              saved
                ? {
                    meta_title: saved.meta_title || saved.title,
                    meta_description: (
                      saved.meta_description ||
                      saved.excerpt ||
                      stripHtml(saved.content)
                    ).slice(0, 160),
                    og_image: saved.featured_image,
                  }
                : undefined
            }
          />

          <Section title="Categories">
            {categoriesLoading ? (
              <Spinner className="py-4" />
            ) : categories.length === 0 ? (
              <p className="text-fg-subtle text-sm">
                No categories yet.{" "}
                <Link
                  href={ADMIN_ROUTES.BLOG_CATEGORIES({ action: "create" })}
                  className="text-primary font-medium hover:underline"
                >
                  Create one
                </Link>
              </p>
            ) : (
              <Controller
                control={control}
                name="category_ids"
                render={({ field }) => (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {categories.map((c) => (
                      <Checkbox
                        key={c.id}
                        className={c.parent_id ? "ml-5 flex" : "flex"}
                        label={c.name}
                        disabled={!canSave}
                        checked={field.value.includes(c.id)}
                        onChange={(on) =>
                          field.onChange(on ? [...field.value, c.id] : field.value.filter((v) => v !== c.id))
                        }
                      />
                    ))}
                  </div>
                )}
              />
            )}
            {errors.category_ids && <p className="text-danger text-xs">{errors.category_ids.message}</p>}
            {categories.length > 0 && (
              <p className="text-fg-subtle flex items-center gap-1 text-xs">
                <FolderTree size={12} />
                <Link href={ADMIN_ROUTES.BLOG_CATEGORIES()} className="hover:text-primary hover:underline">
                  Manage categories
                </Link>
              </p>
            )}
          </Section>

          <Section title="Comments">
            <Controller
              control={control}
              name="comments_enabled"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={!canSave}
                  label="Allow comments on this post"
                  hint="Visitors can comment when comments are also turned on in Settings."
                />
              )}
            />
            {saved && canViewComments && (
              <p className="text-fg-subtle flex items-center gap-1 text-xs">
                <MessagesSquare size={12} />
                <Link
                  href={ADMIN_ROUTES.COMMENTS({ blog_id: saved.id })}
                  className="hover:text-primary hover:underline"
                >
                  View comments on this post
                </Link>
              </p>
            )}
          </Section>

          <Section title="Featured image">
            <Controller
              control={control}
              name="featured_image"
              render={({ field }) => (
                <ImageField
                  value={field.value}
                  onChange={field.onChange}
                  folder="blogs"
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
        viewUrl={isPublished ? WEBSITE_ROUTES.BLOG_POST(saved!.slug) : null}
        onCancel={onCancel}
      />
    </form>
  );
}
