"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";

import { Button, DatePicker, Input, Modal, Select, Textarea } from "@/app/admin/_components/ui/index";
import {
  enquiriesApi,
  ENQUIRY_SOURCES,
  type EnquiryDetail,
  type EnquirySource,
} from "@/app/admin/_lib/api/enquiriesApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

import { SOURCE_OPTIONS, STATUS_OPTIONS, fromDateTimeLocal } from "./constants";

import { QK } from "@/config/query-keys";
const isEmail = (v: string) => !v || z.email().safeParse(v).success;

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(150),
    email: z.string().trim().max(255).refine(isEmail, "Enter a valid email address"),
    phone: z.string().trim().max(30),
    company: z.string().trim().max(150),
    subject: z.string().trim().max(255),
    message: z.string().trim().min(1, "Message is required").max(10000),
    source: z.enum(ENQUIRY_SOURCES),
    status: z.enum(["new", "in_progress"]),
    assigned_to: z.string(),
    follow_up_at: z.string(),
    note: z.string().max(5000),
  })
  .refine((v) => !!v.email || !!v.phone, {
    path: ["email"],
    message: "Provide an email address or a phone number",
  });
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  name: "",
  email: "",
  phone: "",
  company: "",
  subject: "",
  message: "",
  source: "phone-call",
  status: "new",
  assigned_to: "",
  follow_up_at: "",
  note: "",
};

export default function EnquiryModal({
  open,
  enquiry,
  onClose,
  onSaved,
}: {
  open: boolean;
  enquiry: EnquiryDetail | null;
  onClose: () => void;
  onSaved: (saved: EnquiryDetail) => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;
  const errors = formState.errors;
  const isEdit = !!enquiry;

  const { data: assignees = [] } = useQuery({
    queryKey: [QK.ENQUIRIES, "assignees"],
    queryFn: () => enquiriesApi.assignees(),
    enabled: open && !isEdit,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      enquiry
        ? {
            ...EMPTY,
            name: enquiry.name,
            email: enquiry.email ?? "",
            phone: enquiry.phone ?? "",
            company: enquiry.company ?? "",
            subject: enquiry.subject ?? "",
            message: enquiry.message,
            source: (ENQUIRY_SOURCES as readonly string[]).includes(enquiry.source)
              ? (enquiry.source as EnquirySource)
              : "other",
          }
        : EMPTY
    );
  }, [open, enquiry, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const contact = emptyToNull({
      name: values.name,
      email: values.email,
      phone: values.phone,
      company: values.company,
      subject: values.subject,
      message: values.message,
      source: values.source,
    });
    try {
      const res = enquiry
        ? await enquiriesApi.update(enquiry.id, contact)
        : await enquiriesApi.create({
            ...contact,
            status: values.status,
            assigned_to: values.assigned_to ? Number(values.assigned_to) : null,
            follow_up_at: fromDateTimeLocal(values.follow_up_at),
            note: values.note.trim() || null,
          });
      toast.success(res.message ?? "Saved");
      onSaved(res.data);
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save enquiry");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${enquiry.reference}` : "New enquiry"}
      description={
        isEdit
          ? "Update the contact details and message."
          : "Log an enquiry received by phone, email, in person…"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="enquiry-form" loading={formState.isSubmitting}>
            {isEdit ? "Save changes" : "Create enquiry"}
          </Button>
        </>
      }
    >
      <form id="enquiry-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            required
            autoComplete="off"
            error={errors.name?.message}
            {...register("name")}
          />
          <Input label="Company" error={errors.company?.message} {...register("company")} />
          <Input
            label="Email"
            type="email"
            hint="Email or phone is required."
            error={errors.email?.message}
            {...register("email")}
          />
          <Input label="Phone" type="tel" error={errors.phone?.message} {...register("phone")} />
        </div>
        <Input label="Subject" error={errors.subject?.message} {...register("subject")} />
        <Textarea
          label="Message"
          required
          rows={5}
          error={errors.message?.message}
          {...register("message")}
        />
        <Controller
          control={control}
          name="source"
          render={({ field }) => (
            <Select
              label="Source"
              options={SOURCE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.source?.message}
            />
          )}
        />

        {!isEdit && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select
                    label="Status"
                    options={STATUS_OPTIONS.filter((o) => o.value === "new" || o.value === "in_progress")}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Controller
                control={control}
                name="assigned_to"
                render={({ field }) => (
                  <Select
                    label="Assign to"
                    placeholder="Unassigned"
                    searchable
                    options={[
                      { value: "", label: "Unassigned" },
                      ...assignees.map((u) => ({ value: String(u.id), label: u.name })),
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.assigned_to?.message}
                  />
                )}
              />
            </div>
            <Controller
              control={control}
              name="follow_up_at"
              render={({ field }) => (
                <DatePicker
                  withTime
                  label="Follow up on"
                  placeholder="No follow-up"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.follow_up_at?.message}
                />
              )}
            />
            <Textarea
              label="First note"
              rows={3}
              hint="Internal only — not visible to the customer."
              error={errors.note?.message}
              {...register("note")}
            />
          </>
        )}
      </form>
    </Modal>
  );
}
