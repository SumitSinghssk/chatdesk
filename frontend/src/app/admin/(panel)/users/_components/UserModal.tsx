"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Modal, Select, Spinner, Textarea } from "@/app/admin/_components/ui/index";
import { permissionsApi, roleLabel, type Role } from "@/app/admin/_lib/api/rolesApi";
import { usersApi, type User } from "@/app/admin/_lib/api/usersApi";
import { useDirtyClose, useReportDirty } from "@/app/admin/_hooks/useDirtyClose";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

import { PermissionPicker } from "@/app/admin/(panel)/roles/_components/PermissionPicker";

import { QK } from "@/config/query-keys";
const schema = z
  .object({
    isEdit: z.boolean(),
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(150),
    email: z.email("Enter a valid email address").trim(),
    phone: z.string().trim().max(20),
    role_id: z.string(),
    status: z.enum(["active", "inactive"]),
    bio: z.string().max(2000),
    password: z.string().max(72),
    password_confirmation: z.string().max(72),
    permission_ids: z.array(z.number()),
  })
  .superRefine((v, ctx) => {
    if (!v.isEdit && !v.password)
      ctx.addIssue({ code: "custom", path: ["password"], message: "Set a password for the new user" });
    if (v.password && v.password !== v.password_confirmation)
      ctx.addIssue({ code: "custom", path: ["password_confirmation"], message: "Passwords don't match" });
  });
type Values = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "inactive", label: "Inactive", dot: "bg-slate-400" },
];

const EMPTY: Values = {
  isEdit: false,
  name: "",
  email: "",
  phone: "",
  role_id: "",
  status: "active",
  bio: "",
  password: "",
  password_confirmation: "",
  permission_ids: [],
};

export default function UserModal({
  open,
  user,
  loading,
  roles,
  isSelf,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: User | null;
  loading?: boolean;
  roles: Role[];
  isSelf?: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;
  const roleId = useWatch({ control, name: "role_id" });
  const { dirtyRef, requestClose } = useDirtyClose(onClose);
  useReportDirty(dirtyRef, open && formState.isDirty);

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: [QK.PERMISSIONS, "grouped"],
    queryFn: permissionsApi.grouped,
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      user
        ? {
            ...EMPTY,
            isEdit: true,
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
            role_id: user.role_id ? String(user.role_id) : "",
            status: user.status,
            bio: user.bio ?? "",
            permission_ids: user.direct_permission_ids,
          }
        : EMPTY
    );
  }, [open, user, reset]);

  const roleOptions = useMemo(
    () =>
      roles.map((r) => ({
        value: String(r.id),
        label: roleLabel(r.name),
        description: r.description ?? undefined,
      })),
    [roles]
  );
  const role = roles.find((r) => String(r.id) === roleId);
  const inherited = useMemo(() => new Set(role?.permission_ids ?? []), [role]);
  const allViaRole = !!role?.is_system;

  const onSubmit = handleSubmit(async ({ isEdit: _isEdit, ...values }) => {
    const payload = emptyToNull({
      ...values,
      role_id: values.role_id ? Number(values.role_id) : null,
      permission_ids: values.permission_ids.filter((id) => !inherited.has(id)),
    });
    try {
      const res = user ? await usersApi.update(user.id, payload) : await usersApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved(res.data);
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save user");
    }
  });

  return (
    <Modal
      open={open}
      onClose={requestClose}
      variant="drawer"
      size="2xl"
      bodyClassName="lg:overflow-hidden lg:p-0"
      title={user || loading ? "Edit user" : "New user"}
      description={user ? user.email : "Create an admin account and choose what they can access."}
      footer={
        <>
          <Button variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={formState.isSubmitting} disabled={loading}>
            {user ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      {loading ? (
        <Spinner />
      ) : (
        <form
          id="user-form"
          onSubmit={onSubmit}
          className="grid gap-6 lg:h-full lg:grid-cols-2 lg:grid-rows-1 lg:gap-0"
          noValidate
        >
          <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto lg:p-5">
            <section className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  required
                  autoComplete="off"
                  error={formState.errors.name?.message}
                  {...register("name")}
                />
                <Input
                  label="Email"
                  type="email"
                  required
                  autoComplete="off"
                  error={formState.errors.email?.message}
                  {...register("email")}
                />
                <Input
                  label="Phone"
                  type="tel"
                  error={formState.errors.phone?.message}
                  {...register("phone")}
                />
                <Controller
                  control={control}
                  name="role_id"
                  render={({ field, fieldState }) => (
                    <Select
                      label="Role"
                      placeholder="No role"
                      clearable={!isSelf}
                      disabled={isSelf}
                      options={roleOptions}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      hint={isSelf ? "You can't change your own role." : undefined}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="status"
                  render={({ field, fieldState }) => (
                    <Select
                      label="Status"
                      disabled={isSelf}
                      options={STATUS_OPTIONS}
                      value={field.value}
                      onChange={(v) => field.onChange(v as Values["status"])}
                      onBlur={field.onBlur}
                      name={field.name}
                      hint={isSelf ? "You can't change your own status." : "Inactive users can't sign in."}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </div>
              <Textarea label="Bio" rows={3} error={formState.errors.bio?.message} {...register("bio")} />
            </section>

            <section className="border-line space-y-3 border-t pt-5">
              <div>
                <h4 className="text-fg text-sm font-semibold">Password</h4>
                <p className="text-fg-subtle text-xs">
                  {user
                    ? "Leave blank to keep the current password."
                    : "The user can change it later from their profile."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  required={!user}
                  error={formState.errors.password?.message}
                  {...register("password")}
                />
                <Input
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  required={!user}
                  error={formState.errors.password_confirmation?.message}
                  {...register("password_confirmation")}
                />
              </div>
            </section>
          </div>

          <section className="border-line space-y-3 border-t pt-5 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:p-5">
            <div>
              <h4 className="text-fg text-sm font-semibold">Direct permissions</h4>
              <p className="text-fg-subtle flex items-start gap-1.5 text-xs">
                <Info size={13} className="mt-px shrink-0" aria-hidden />
                {role
                  ? `Permissions from the ${roleLabel(role.name)} role are inherited automatically. Grant extra ones here.`
                  : "Without a role, the user only gets the permissions you tick here."}
              </p>
            </div>
            {allViaRole ? (
              <p className="bg-primary-soft text-primary rounded-lg px-3 py-2 text-sm">
                The {roleLabel(role!.name)} role has every permission.
              </p>
            ) : (
              <Controller
                control={control}
                name="permission_ids"
                render={({ field }) => (
                  <PermissionPicker
                    groups={groups}
                    loading={groupsLoading}
                    value={field.value}
                    onChange={field.onChange}
                    inherited={inherited}
                  />
                )}
              />
            )}
            {formState.errors.permission_ids?.message && (
              <p role="alert" className="text-danger text-xs">
                {formState.errors.permission_ids.message}
              </p>
            )}
          </section>
        </form>
      )}
    </Modal>
  );
}
