"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, Input, Modal, Select } from "@/app/admin/_components/ui/index";
import { notFoundApi, type NotFoundLog } from "@/app/admin/_lib/api/notFoundApi";
import { REDIRECT_CODE_OPTIONS, type RedirectCode } from "@/app/admin/_lib/api/redirectsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";

const schema = z.object({
  target_url: z.string().trim().min(1, "New URL is required").max(2048),
  status_code: z.enum(["301", "302", "307", "308"]),
});
type Values = z.infer<typeof schema>;

export function CreateRedirectModal({
  log,
  onClose,
  onSaved,
}: {
  log: NotFoundLog | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { target_url: "", status_code: "301" },
  });
  const { register, handleSubmit, reset, control, formState, setError } = form;

  useEffect(() => {
    if (!log) return;
    reset({
      target_url: log.redirect?.target_url ?? "",
      status_code: String(log.redirect?.status_code ?? 301) as Values["status_code"],
    });
  }, [log, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!log) return;
    try {
      const res = await notFoundApi.redirect(
        log.id,
        values.target_url,
        Number(values.status_code) as RedirectCode
      );
      toast.success(res.message ?? "Redirect created");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't create redirect", ["target_url", "status_code"]);
    }
  });

  return (
    <Modal
      open={!!log}
      onClose={onClose}
      size="sm"
      title="Redirect this URL"
      description={<span className="font-mono">{log?.path}</span>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="nf-redirect-form" loading={formState.isSubmitting}>
            Create redirect
          </Button>
        </>
      }
    >
      <form id="nf-redirect-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="New URL"
          required
          autoFocus
          placeholder="/new-page"
          className="font-mono"
          error={formState.errors.target_url?.message}
          {...register("target_url")}
        />
        <Controller
          control={control}
          name="status_code"
          render={({ field }) => (
            <Select
              label="Redirect type"
              options={REDIRECT_CODE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={formState.errors.status_code?.message}
            />
          )}
        />
      </form>
    </Modal>
  );
}
