"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterSelect,
  Input,
  ListToolbar,
  Modal,
  Pagination,
  RowActions,
  type Column,
} from "@/app/admin/_components/ui/index";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { permissionsApi, type Permission, type PermissionGroup } from "@/app/admin/_lib/api/rolesApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

import { QK } from "@/config/query-keys";
const schema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$/, "Use the format resource.action, e.g. reports.export"),
  group: z.string().trim().max(100),
  description: z.string().trim().max(255),
});
type Values = z.infer<typeof schema>;

function PermissionModal({
  open,
  groups,
  onClose,
  onSaved,
}: {
  open: boolean;
  groups: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { register, handleSubmit, reset, formState, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", group: "", description: "" },
  });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await permissionsApi.create(emptyToNull(values));
      toast.success(res.message ?? "Permission created");
      reset();
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't create permission");
    }
  });

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title="New permission"
      description="Custom permissions can be checked by new features or integrations."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="permission-form" loading={formState.isSubmitting}>
            Create permission
          </Button>
        </>
      }
    >
      <form id="permission-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Name"
          required
          placeholder="reports.export"
          className="font-mono"
          error={formState.errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Group"
          list="permission-groups"
          hint="Leave blank to derive it from the resource name."
          error={formState.errors.group?.message}
          {...register("group")}
        />
        <datalist id="permission-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <Input
          label="Description"
          error={formState.errors.description?.message}
          {...register("description")}
        />
      </form>
    </Modal>
  );
}

export function PermissionsTab({
  groups,
  canCreate,
  canDelete,
}: {
  groups: PermissionGroup[] | undefined;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["tab", "group"] });
  const [creating, setCreating] = useState(false);
  const params = {
    page: list.page,
    per_page: list.perPage,
    search: list.search || undefined,
    group: list.filters.group,
  };

  const { data, isLoading } = useQuery({
    queryKey: [QK.PERMISSIONS, "page", params],
    queryFn: ({ signal }) => permissionsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.PERMISSIONS] });

  const remove = async (p: Permission) => {
    const ok = await confirm({
      title: "Delete permission?",
      message: (
        <>
          <b className="font-mono">{p.name}</b> will be permanently deleted.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await permissionsApi.remove(p.id);
      toast.success(res.message ?? "Deleted");
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete permission"));
    }
  };

  const groupNames = (groups ?? []).map((g) => g.group);

  const columns: Column<Permission>[] = [
    {
      key: "name",
      header: "Permission",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-fg font-mono text-sm">{row.name}</p>
          {row.description && <p className="text-fg-subtle truncate text-xs">{row.description}</p>}
        </div>
      ),
    },
    { key: "group", header: "Group", cell: (row) => row.group, hideOnMobile: true },
    { key: "roles", header: "Roles", cell: (row) => row.roles_count ?? 0 },
    {
      key: "type",
      header: "Type",
      hideOnMobile: true,
      cell: (row) => (row.is_builtin ? <Badge>Built-in</Badge> : <Badge tone="purple">Custom</Badge>),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => <RowActions onDelete={canDelete && !row.is_builtin ? () => remove(row) : undefined} />,
    },
  ];

  return (
    <>
      <ListToolbar
        search={list.searchInput}
        onSearch={list.setSearchInput}
        placeholder="Search permissions…"
        showReset={!!list.search || !!list.filters.group}
        onReset={() => {
          list.setSearchInput("");
          list.setFilter("group", "");
        }}
      >
        <FilterSelect
          label="Group"
          value={list.filters.group}
          onChange={(v) => list.setFilter("group", v)}
          options={[{ value: "", label: "All groups" }, ...groupNames.map((g) => ({ value: g, label: g }))]}
        />
        {canCreate && (
          <Button size="sm" leftIcon={Plus} className="ml-auto" onClick={() => setCreating(true)}>
            New permission
          </Button>
        )}
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(r) => r.id}
        loading={isLoading}
        empty={<EmptyState icon={KeyRound} title="No permissions match your filters" />}
      />
      <Pagination
        meta={data?.meta}
        onPageChange={list.setPage}
        onPerPageChange={list.setPerPage}
        unit="permissions"
      />

      <PermissionModal
        open={creating}
        groups={groupNames}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          refresh();
        }}
      />
    </>
  );
}
