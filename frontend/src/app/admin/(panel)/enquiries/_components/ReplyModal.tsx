"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, Checkbox, ErrorBanner, Input, Modal, Textarea } from "@/app/admin/_components/ui/index";
import { enquiriesApi, type EnquiryDetail } from "@/app/admin/_lib/api/enquiriesApi";
import { getOne } from "@/app/admin/_lib/api/crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";

const schema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(255),
  body: z.string().trim().min(1, "Write a message").max(20000),
  include_original: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function ReplyModal({
  open,
  enquiry,
  onClose,
  onSent,
}: {
  open: boolean;
  enquiry: EnquiryDetail;
  onClose: () => void;
  onSent: (detail: EnquiryDetail) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, reset, formState, setError, control } = form;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const subject = enquiry.subject || "Your enquiry";
    const fallback = {
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      body: `Hi ${enquiry.name.split(" ")[0]},\n\n`,
    };
    getOne<{ subject: string; body: string }>(ADMIN_ENDPOINTS.ENQUIRIES.REPLY_DRAFT(enquiry.id))
      .catch(() => fallback)
      .then((draft) => {
        if (!cancelled)
          reset({
            subject: draft.subject || fallback.subject,
            body: draft.body || fallback.body,
            include_original: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [open, enquiry, reset]);

  const close = () => {
    setServerError(null);
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await enquiriesApi.reply(enquiry.id, values);
      toast.success(res.message ?? "Reply sent");
      onSent(res.data);
    } catch (err) {
      for (const [field, message] of Object.entries(apiFieldErrors(err))) {
        if (field === "subject" || field === "body") setError(field, { type: "server", message });
      }
      setServerError(apiErrorMessage(err, "Couldn't send the reply"));
    }
  });

  return (
    <Modal
      open={open}
      onClose={close}
      title="Reply by email"
      description={<>To {enquiry.email}</>}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="reply-form" loading={formState.isSubmitting}>
            Send reply
          </Button>
        </>
      }
    >
      <form id="reply-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <ErrorBanner message={serverError} />}
        <Input label="Subject" required error={formState.errors.subject?.message} {...register("subject")} />
        <Textarea
          label="Message"
          required
          rows={10}
          autoFocus
          error={formState.errors.body?.message}
          {...register("body")}
        />
        <Controller
          control={control}
          name="include_original"
          render={({ field }) => (
            <Checkbox
              checked={!!field.value}
              onChange={field.onChange}
              label="Include the original message"
              hint="Quoted below your reply."
            />
          )}
        />
        <p className="text-fg-subtle text-xs">
          Sending a reply to a <b>New</b> enquiry marks it as <b>Replied</b>. The reply is saved to the
          timeline.
        </p>
      </form>
    </Modal>
  );
}
