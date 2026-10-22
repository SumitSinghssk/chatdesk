"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, ImageField, Input, Modal, Select, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { LabelWithCount } from "@/app/admin/(panel)/blogs/_components/CharCount";
import { testimonialsApi, type Testimonial } from "@/app/admin/_lib/api/testimonialsApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

export const RATING_OPTIONS = [
  { value: "5", label: "5 — Excellent" },
  { value: "4", label: "4 — Very good" },
  { value: "3", label: "3 — Good" },
  { value: "2", label: "2 — Fair" },
  { value: "1", label: "1 — Poor" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "inactive", label: "Inactive", dot: "bg-slate-400" },
];

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(150),
  designation: z.string().trim().max(150),
  company: z.string().trim().max(150),
  quote: z
    .string()
    .trim()
    .min(10, "Quote must be at least 10 characters")
    .max(2000, "Quote must be at most 2000 characters"),
  photo: z.string().nullable(),
  rating: z.string(),
  is_featured: z.boolean(),
  sort_order: z.number({ error: "Enter a number" }).int().min(0).max(65535),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  name: "",
  designation: "",
  company: "",
  quote: "",
  photo: null,
  rating: "5",
  is_featured: false,
  sort_order: 0,
  status: "active",
};

export default function TestimonialModal({
  open,
  testimonial,
  onClose,
  onSaved,
}: {
  open: boolean;
  testimonial: Testimonial | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;
  const errors = formState.errors;
  const quote = useWatch({ control, name: "quote" });

  useEffect(() => {
    if (!open) return;
    reset(
      testimonial
        ? {
            name: testimonial.name,
            designation: testimonial.designation ?? "",
            company: testimonial.company ?? "",
            quote: testimonial.quote,
            photo: testimonial.photo,
            rating: testimonial.rating ? String(testimonial.rating) : "",
            is_featured: testimonial.is_featured,
            sort_order: testimonial.sort_order,
            status: testimonial.status,
          }
        : EMPTY
    );
  }, [open, testimonial, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const payload = { ...emptyToNull(values), rating: values.rating ? Number(values.rating) : null };
    try {
      const res = testimonial
        ? await testimonialsApi.update(testimonial.id, payload)
        : await testimonialsApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save testimonial");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={testimonial ? "Edit testimonial" : "New testimonial"}
      description="Customer quotes shown on the website."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="testimonial-form" loading={formState.isSubmitting}>
            {testimonial ? "Save changes" : "Create testimonial"}
          </Button>
        </>
      }
    >
      <form id="testimonial-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
          <Controller
            control={control}
            name="photo"
            render={({ field }) => (
              <ImageField
                label="Photo"
                value={field.value}
                onChange={field.onChange}
                folder="testimonials"
                aspect="aspect-square"
                hint="Square"
              />
            )}
          />
          <div className="space-y-4">
            <Input label="Name" required error={errors.name?.message} {...register("name")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Designation"
                placeholder="e.g. Founder"
                error={errors.designation?.message}
                {...register("designation")}
              />
              <Input label="Company" error={errors.company?.message} {...register("company")} />
            </div>
          </div>
        </div>
        <Textarea
          label={<LabelWithCount label="Quote" count={quote.trim().length} max={2000} />}
          required
          rows={5}
          error={errors.quote?.message}
          {...register("quote")}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Controller
            control={control}
            name="rating"
            render={({ field }) => (
              <Select
                label="Rating"
                placeholder="No rating"
                clearable
                options={RATING_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.rating?.message}
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
              hint="Highlight this testimonial on the home page."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </form>
    </Modal>
  );
}
