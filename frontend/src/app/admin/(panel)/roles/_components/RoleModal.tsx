"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button, Input, Modal, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { permissionsApi, roleLabel, rolesApi, type Role } from "@/app/admin/_lib/api/rolesApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

import { PermissionPicker } from "./PermissionPicker";

import { QK } from "@/config/query-keys";
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100)
    .regex(/^[A-Za-z0-9_ ]+$/, "Use letters, numbers, spaces or underscores only"),
  description: z.string().max(255),
  requires_two_factor: z.boolean(),
  permission_ids: z.array(z.number()),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", description: "", requires_two_factor: false, permission_ids: [] };

export default function RoleModal({
  open,
  role,
  onClose,
  onSaved,
}: {
  open: boolean;
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;
  const { data: groups, isLoading } = useQuery({
    queryKey: [QK.PERMISSIONS, "grouped"],
    queryFn: permissionsApi.grouped,
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      role
        ? {
            name: role.name,
            description: role.description ?? "",
            requires_two_factor: role.requires_two_factor,
            permission_ids: role.permission_ids,
          }
        : EMPTY
    );
  }, [open, role, reset]);

  const system = !!role?.is_system;

  const onSubmit = handleSubmit(async (values) => {
    const payload = emptyToNull(values);
    try {
      const res = role ? await rolesApi.update(role.id, payload) : await rolesApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save role");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={role ? `Edit ${roleLabel(role.name)}` : "New role"}
      description={
        role && !role.is_system && role.users_count
          ? `Changing permissions signs out the ${role.users_count} user(s) with this role.`
          : "A role bundles permissions you can assign to users."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" loading={formState.isSubmitting}>
            {role ? "Save changes" : "Create role"}
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <Input
          label="Name"
          required
          readOnly={system}
          hint={system ? "System roles can't be renamed." : "Saved in snake_case, e.g. content_manager."}
          error={formState.errors.name?.message}
          {...register("name")}
        />
        <Textarea
          label="Description"
          rows={2}
          error={formState.errors.description?.message}
          {...register("description")}
        />
        <Controller
          control={control}
          name="requires_two_factor"
          render={({ field }) => (
            <Switch
              label="Require two-factor sign-in"
              hint="Members must set up an authenticator app before they can use the admin panel."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <div className="border-line space-y-3 border-t pt-5">
          <h4 className="text-fg text-sm font-semibold">Permissions</h4>
          {system ? (
            <p className="bg-primary-soft text-primary rounded-lg px-3 py-2 text-sm">
              This system role always has every permission.
            </p>
          ) : (
            <Controller
              control={control}
              name="permission_ids"
              render={({ field }) => (
                <PermissionPicker
                  groups={groups}
                  loading={isLoading}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          )}
          {formState.errors.permission_ids?.message && (
            <p role="alert" className="text-danger text-xs">
              {formState.errors.permission_ids.message}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
