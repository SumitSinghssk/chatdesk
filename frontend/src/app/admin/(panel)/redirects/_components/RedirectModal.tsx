"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, Input, Modal, Select } from "@/app/admin/_components/ui/index";
import {
  REDIRECT_CODE_OPTIONS,
  redirectsApi,
  type Redirect,
  type RedirectCode,
} from "@/app/admin/_lib/api/redirectsApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "inactive", label: "Inactive", dot: "bg-slate-400" },
];

const schema = z.object({
  source_path: z
    .string()
    .trim()
    .min(1, "Old URL is required")
    .max(500)
    .refine((v) => !/^https?:\/\//i.test(v), "Use a path on this site, e.g. /old-page"),
  target_url: z.string().trim().min(1, "New URL is required").max(2048),
  status_code: z.enum(["301", "302", "307", "308"]),
  status: z.enum(["active", "inactive"]),
  note: z.string().trim().max(255),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { source_path: "", target_url: "", status_code: "301", status: "active", note: "" };

export default function RedirectModal({
  open,
  redirect,
  onClose,
  onSaved,
}: {
  open: boolean;
  redirect: Redirect | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      redirect
        ? {
            source_path: redirect.source_path,
            target_url: redirect.target_url,
            status_code: String(redirect.status_code) as Values["status_code"],
            status: redirect.status,
            note: redirect.note ?? "",
          }
        : EMPTY
    );
  }, [open, redirect, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const payload = emptyToNull({ ...values, status_code: Number(values.status_code) as RedirectCode });
    try {
      const res = redirect
        ? await redirectsApi.update(redirect.id, payload)
        : await redirectsApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save redirect");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={redirect ? "Edit redirect" : "New redirect"}
      description="Send visitors (and search engines) from an old URL to a new one."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="redirect-form" loading={formState.isSubmitting}>
            {redirect ? "Save changes" : "Create redirect"}
          </Button>
        </>
      }
    >
      <form id="redirect-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Old URL"
          required
          placeholder="/old-page"
          className="font-mono"
          hint="A path on this site. Query strings are ignored."
          error={errors.source_path?.message}
          {...register("source_path")}
        />
        <Input
          label="New URL"
          required
          placeholder="/new-page or https://other-site.com/page"
          className="font-mono"
          error={errors.target_url?.message}
          {...register("target_url")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="status_code"
            render={({ field }) => (
              <Select
                label="Redirect type"
                options={REDIRECT_CODE_OPTIONS}
                hint="Use 301 unless the move is temporary."
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.status_code?.message}
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
        <Input
          label="Note"
          placeholder="Why this redirect exists (optional)"
          error={errors.note?.message}
          {...register("note")}
        />
      </form>
    </Modal>
  );
}
