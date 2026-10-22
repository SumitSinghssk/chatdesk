"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Avatar, Badge, Button, Input, Modal, Select } from "@/app/admin/_components/ui/index";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { customersApi, type Customer, type CustomerMethod } from "@/app/admin/_lib/api/customersApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";
import { QK } from "@/config/query-keys";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const METHOD_LABELS: Record<CustomerMethod, string> = {
  password: "Email & password",
  otp: "Mobile OTP",
  google: "Google",
  admin: "Added by admin",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "inactive", label: "Blocked", dot: "bg-slate-400" },
];

const schema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(150),
    business_name: z.string().trim().max(150),
    email: z.union([z.literal(""), z.email("Enter a valid email")]),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[+\d\s()-]*$/, "Use digits only, with an optional + country code"),
    password: z.string().max(128),
    status: z.enum(["active", "inactive"]),
  })
  .refine((v) => v.email || v.phone, { path: ["email"], message: "Add an email or a mobile number" });
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", business_name: "", email: "", phone: "", password: "", status: "active" };

const WHATSAPP_LABELS = {
  connected: ["success", "Connected"],
  error: ["danger", "Meta rejected the details"],
  not_connected: ["neutral", "Not connected yet"],
} as const;

function WhatsAppDetails({ customer }: { customer: Customer }) {
  const wa = customer.whatsapp;
  const [tone, label] = WHATSAPP_LABELS[wa.status];
  return (
    <div className="border-line rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-fg text-sm font-semibold">WhatsApp number</p>
        <Badge tone={tone} dot>
          {label}
        </Badge>
      </div>
      {wa.status !== "not_connected" && (
        <p className="text-fg-subtle mt-1 text-xs">
          {[wa.display_phone_number, wa.verified_name, wa.quality_rating && `Quality ${wa.quality_rating}`]
            .filter(Boolean)
            .join(" · ") || "No details from Meta yet"}
          {wa.last_event_at && ` · last message ${timeAgo(wa.last_event_at)}`}
        </p>
      )}
    </div>
  );
}

function LoginDetails({ customer }: { customer: Customer }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const { data } = useQuery({
    queryKey: [QK.CUSTOMERS, "detail", customer.id],
    queryFn: () => customersApi.detail(customer.id),
  });
  const sessions = data?.sessions ?? [];

  const signOut = async () => {
    const ok = await confirm({
      title: "Sign out of every device?",
      message: "The customer will need to sign in again on all their devices.",
      confirmLabel: "Sign out",
      variant: "warning",
    });
    if (!ok) return;
    setSigningOut(true);
    try {
      const res = await customersApi.signOut(customer.id);
      toast.success(res.message ?? "Signed out");
      await queryClient.invalidateQueries({ queryKey: [QK.CUSTOMERS] });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't sign the customer out"));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="border-line bg-page space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="info">Joined with {METHOD_LABELS[customer.signup_method]}</Badge>
        {customer.phone_verified_at && <Badge tone="success">Mobile verified</Badge>}
        {customer.email_verified_at && <Badge tone="success">Email verified</Badge>}
        {customer.google_linked && <Badge tone="brand">Google linked</Badge>}
        {customer.has_password && <Badge>Has password</Badge>}
      </div>
      <p className="text-fg-subtle text-xs">
        Joined {formatDateTime(customer.created_at)}
        {customer.last_login_at &&
          ` · Last sign-in ${timeAgo(customer.last_login_at)}${
            customer.last_login_method ? ` with ${METHOD_LABELS[customer.last_login_method]}` : ""
          }${customer.last_login_ip ? ` from ${customer.last_login_ip}` : ""}`}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-fg-muted text-[13px] font-medium">
          Signed in on {sessions.length} device{sessions.length === 1 ? "" : "s"}
        </p>
        {sessions.length > 0 && (
          <Button size="sm" variant="ghost" leftIcon={LogOut} loading={signingOut} onClick={signOut}>
            Sign out everywhere
          </Button>
        )}
      </div>
      {sessions.length > 0 && (
        <ul className="divide-line divide-y">
          {sessions.map((s) => {
            const Icon = s.device === "mobile" || s.device === "tablet" ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-2.5 py-2">
                <Icon className="text-fg-subtle h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="text-fg block truncate">
                    {[s.browser, s.platform].filter(Boolean).join(" on ") || "Unknown device"}
                  </span>
                  <span className="text-fg-subtle block truncate text-xs">
                    {s.ip_address ?? "Unknown IP"} · active {timeAgo(s.last_active_at)}
                    {s.method ? ` · ${METHOD_LABELS[s.method]}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function CustomerModal({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      customer
        ? {
            name: customer.name ?? "",
            business_name: customer.business_name ?? "",
            email: customer.email ?? "",
            phone: customer.phone ?? "",
            password: "",
            status: customer.status,
          }
        : EMPTY
    );
  }, [open, customer, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const payload = emptyToNull(values);
    try {
      const res = customer
        ? await customersApi.update(customer.id, payload)
        : await customersApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save customer");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={customer ? "Edit customer" : "New customer"}
      description="Customers are businesses using the WhatsApp workspace. They can't access the admin panel."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={formState.isSubmitting}>
            {customer ? "Save changes" : "Add customer"}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {customer && (
          <div className="flex items-center gap-3">
            <Avatar name={customer.name ?? customer.email ?? "?"} src={customer.avatar} size={44} />
            <div className="min-w-0">
              <p className="text-fg truncate font-semibold">
                {customer.business_name || customer.name || "Unnamed customer"}
              </p>
              <p className="text-fg-subtle truncate text-xs">Customer #{customer.id}</p>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Business name"
            placeholder="Aanya Fashion"
            error={errors.business_name?.message}
            {...register("business_name")}
          />
          <Input label="Contact name" required error={errors.name?.message} {...register("name")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
          <Input
            label="Mobile number"
            type="tel"
            placeholder="98765 43210"
            hint="Without a + code, the default country code from SMS settings is used."
            error={errors.phone?.message}
            {...register("phone")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={customer?.has_password ? "New password" : "Password"}
            type="password"
            autoComplete="new-password"
            placeholder={customer?.has_password ? "•••••• (saved)" : ""}
            hint={
              customer?.has_password
                ? "Leave blank to keep it. Changing it signs the customer out everywhere."
                : "Optional. Lets them sign in with email or mobile and password."
            }
            error={errors.password?.message}
            {...register("password")}
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
                hint="Blocked customers are signed out and can't sign in."
              />
            )}
          />
        </div>
        {customer && <WhatsAppDetails customer={customer} />}
        {customer && <LoginDetails customer={customer} />}
      </form>
    </Modal>
  );
}
