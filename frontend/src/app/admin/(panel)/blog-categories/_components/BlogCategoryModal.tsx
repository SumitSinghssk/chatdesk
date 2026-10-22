"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, ImageField, Input, Modal, Select, Textarea } from "@/app/admin/_components/ui/index";
import { blogCategoriesApi, type BlogCategory } from "@/app/admin/_lib/api/blogCategoriesApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(150),
  slug: z.string().trim().max(180).optional(),
  parent_id: z.string().optional(),
  description: z.string().max(2000).optional(),
  image: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "inactive", label: "Inactive", dot: "bg-slate-400" },
];

const EMPTY: Values = { name: "", slug: "", parent_id: "", description: "", image: null, status: "active" };

export default function BlogCategoryModal({
  open,
  category,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: BlogCategory | null;
  categories: BlogCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;

  useEffect(() => {
    if (!open) return;
    reset(
      category
        ? {
            name: category.name,
            slug: category.slug,
            parent_id: category.parent_id ? String(category.parent_id) : "",
            description: category.description ?? "",
            image: category.image,
            status: category.status,
          }
        : EMPTY
    );
  }, [open, category, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const payload = emptyToNull({ ...values, parent_id: values.parent_id ? Number(values.parent_id) : null });
    try {
      const res = category
        ? await blogCategoriesApi.update(category.id, payload)
        : await blogCategoriesApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save category");
    }
  });

  const parentOptions = categories
    .filter((c) => c.id !== category?.id)
    .map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Edit category" : "New category"}
      description="Categories group blog posts on the website."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={formState.isSubmitting}>
            {category ? "Save changes" : "Create category"}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="Name" required error={formState.errors.name?.message} {...register("name")} />
        <Input
          label="Slug"
          hint="Used in the URL. Leave blank to generate it from the name."
          error={formState.errors.slug?.message}
          {...register("slug")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="parent_id"
            render={({ field }) => (
              <Select
                label="Parent category"
                placeholder="None (top level)"
                clearable
                options={parentOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={formState.errors.parent_id?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </div>
        <Textarea
          label="Description"
          rows={3}
          error={formState.errors.description?.message}
          {...register("description")}
        />
        <Controller
          control={control}
          name="image"
          render={({ field }) => (
            <ImageField label="Image" value={field.value} onChange={field.onChange} folder="categories" />
          )}
        />
      </form>
    </Modal>
  );
}
