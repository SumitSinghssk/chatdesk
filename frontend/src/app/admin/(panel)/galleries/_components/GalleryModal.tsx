"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, DatePicker, Input, Modal, Select, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { galleriesApi, type Gallery, type GalleryDetail } from "@/app/admin/_lib/api/galleriesApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";
import { slugify } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "inactive", label: "Inactive", dot: "bg-slate-400" },
];

const schema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(255),
  slug: z.string().trim().max(280),
  description: z.string().max(2000),
  event_date: z.string(),
  is_featured: z.boolean(),
  sort_order: z.number({ error: "Enter a number" }).int().min(0).max(65535),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  title: "",
  slug: "",
  description: "",
  event_date: "",
  is_featured: false,
  sort_order: 0,
  status: "active",
};

export default function GalleryModal({
  open,
  gallery,
  onClose,
  onSaved,
}: {
  open: boolean;
  gallery: Gallery | GalleryDetail | null;
  onClose: () => void;
  onSaved: (gallery: GalleryDetail) => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, setValue, formState, setError } = form;
  const errors = formState.errors;
  const [slugTouched, setSlugTouched] = useState(!!gallery);

  useEffect(() => {
    if (!open) return;
    reset(
      gallery
        ? {
            title: gallery.title,
            slug: gallery.slug,
            description: gallery.description ?? "",
            event_date: gallery.event_date ?? "",
            is_featured: gallery.is_featured,
            sort_order: gallery.sort_order,
            status: gallery.status,
          }
        : EMPTY
    );
  }, [open, gallery, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const cover = gallery
        ? "stored_cover_image" in gallery
          ? gallery.stored_cover_image
          : (await galleriesApi.get(gallery.id)).stored_cover_image
        : null;
      const payload = { ...emptyToNull(values), cover_image: cover };
      const res = gallery
        ? await galleriesApi.update(gallery.id, payload)
        : await galleriesApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved(res.data as GalleryDetail);
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save gallery");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={gallery ? "Edit gallery" : "New gallery"}
      description={
        gallery ? "Update the album details." : "Create an album, then add photos and videos to it."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="gallery-form" loading={formState.isSubmitting}>
            {gallery ? "Save changes" : "Create gallery"}
          </Button>
        </>
      }
    >
      <form id="gallery-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Title"
          required
          error={errors.title?.message}
          {...register("title", {
            onChange: (e) => !slugTouched && setValue("slug", slugify(e.target.value), { shouldDirty: true }),
          })}
        />
        <Input
          label="Slug"
          hint="Used in the URL. Leave blank to generate it from the title."
          error={errors.slug?.message}
          {...register("slug", { onChange: (e) => setSlugTouched(e.target.value !== "") })}
        />
        <Textarea
          label="Description"
          rows={3}
          error={errors.description?.message}
          {...register("description")}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Controller
            control={control}
            name="event_date"
            render={({ field }) => (
              <DatePicker
                label="Event date"
                placeholder="No date"
                value={field.value}
                onChange={field.onChange}
                error={errors.event_date?.message}
              />
            )}
          />
          <Input
            type="number"
            min={0}
            label="Sort order"
            hint="Lower shows first"
            error={errors.sort_order?.message}
            {...register("sort_order", { valueAsNumber: true })}
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
        <Controller
          control={control}
          name="is_featured"
          render={({ field }) => (
            <Switch
              label="Featured"
              hint="Show this gallery prominently on the website."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </form>
    </Modal>
  );
}
