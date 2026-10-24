"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Images, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Modal,
  Pagination,
  RowActions,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { mediaApi, type MediaFile } from "@/app/admin/_lib/api/mediaApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatBytes, formatDate, formatDateTime } from "@/lib/utils";

import { MediaDetails, isImage } from "./MediaDetails";
import { MediaKpis, type MediaKpi } from "./MediaKpis";
import { MediaCard, MediaListItem, MediaThumb, dimensions, fileName } from "./MediaViews";
import { UploadZone } from "./UploadZone";

import { QK } from "@/config/query-keys";
const KIND_OPTIONS = [
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
];
const EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "ico",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "zip",
];
const KIND_LABEL: Record<string, string> = { image: "Image", document: "Document", other: "Other" };
const kindOf = (f: MediaFile) =>
  isImage(f)
    ? "image"
    : ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip"].includes(f.extension ?? "")
      ? "document"
      : "other";

const muted = <span className="text-fg-faint">—</span>;

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

const isKind = (r: FilterRule, kind: string) =>
  r.field === "kind" && r.op === "in" && Array.isArray(r.value) && r.value.join() === kind;

function activeKpi(filters: FilterRule[], legacy: { folder: string; type: string }): MediaKpi | null {
  if (legacy.folder) return null;
  if (legacy.type) return filters.length ? null : (legacy.type as MediaKpi);
  if (!filters.length) return "all";
  if (
    filters.length === 2 &&
    filters.some((r) => isKind(r, "image")) &&
    filters.some((r) => r.field === "has_alt" && r.op === "is_false")
  )
    return "missing_alt";
  if (filters.length > 1) return null;
  const [r] = filters;
  if (isKind(r, "image")) return "image";
  if (isKind(r, "document")) return "document";
  if (r.field === "created_at" && r.op === "between") return "recent";
  return null;
}

export default function MediaLibrary() {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["folder", "type"], defaultPerPage: 48 });
  const grid = useGridUrlState();
  const selection = useBulkSelection();
  const [showUpload, setShowUpload] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.MEDIA, params],
    queryFn: ({ signal }) => mediaApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.MEDIA, "stats"], queryFn: mediaApi.stats });
  const { data: folders = [] } = useQuery({ queryKey: [QK.MEDIA, "folders"], queryFn: mediaApi.folders });

  if (!can(PERM.MEDIA_VIEW)) return <AccessDenied />;

  const canUpload = can(PERM.MEDIA_UPLOAD);
  const canDelete = can(PERM.MEDIA_DELETE);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.MEDIA] });
  const opened = data?.items.find((f) => f.id === openId) ?? null;
  const filtered = list.hasFilters || grid.filters.length > 0;
  const active = activeKpi(grid.filters, list.filters);

  const folderRule = grid.filters.find((r) => r.field === "folder" && r.op === "in");
  const uploadFolder =
    list.filters.folder ||
    (Array.isArray(folderRule?.value) && folderRule.value.length === 1 ? folderRule.value[0] : "") ||
    "general";

  const selectKpi = (kpi: MediaKpi) => {
    selection.clear();
    const reset = { folder: null, type: null, search: null };
    if (kpi === "all" || kpi === active) return grid.setFiltersWith([], reset);
    if (kpi === "image" || kpi === "document") grid.setFiltersWith([rule("kind", "in", [kpi])], reset);
    else if (kpi === "missing_alt")
      grid.setFiltersWith([rule("kind", "in", ["image"]), rule("has_alt", "is_false")], reset);
    else {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      grid.setFiltersWith([rule("created_at", "between", [toYmd(from), toYmd(today)])], reset);
    }
  };

  const upload = async (files: File[]) => {
    const folder = uploadFolder;
    let done = 0;
    let failed = 0;
    setProgress(0);
    for (const file of files) {
      try {
        await mediaApi.upload(file, folder);
      } catch (err) {
        failed++;
        toast.error(`${file.name}: ${apiErrorMessage(err, "upload failed")}`);
      }
      setProgress(Math.round((++done / files.length) * 100));
    }
    setProgress(null);
    if (done > failed) toast.success(`${done - failed} file(s) uploaded to “${folder}”`);
    refresh();
  };

  const removeOne = async (file: MediaFile) => {
    const ok = await confirm({
      title: "Delete file?",
      message: (
        <>
          <b>{fileName(file)}</b> will be permanently deleted. Pages that use it will show a broken image.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await mediaApi.remove(file.id);
      toast.success(res.message ?? "File deleted");
      setOpenId(null);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete file"));
    }
  };

  const removeSelected = async () => {
    const ok = await confirm({
      title: `Delete ${selection.count} file(s)?`,
      message: "Selected files will be permanently deleted. This can't be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await mediaApi.bulkDelete(selection.ids);
      toast.success(res.message ?? "Files deleted");
      selection.clear();
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete files"));
    }
  };

  const rowActions = (row: MediaFile) => (
    <RowActions
      history={{ type: "media", id: row.id, label: row.original_name ?? undefined }}
      onEdit={() => setOpenId(row.id)}
      onDelete={canDelete ? () => removeOne(row) : undefined}
    />
  );

  const columns: GridColumn<MediaFile>[] = [
    {
      id: "name",
      header: "File",
      type: "text",
      size: 300,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-3">
          <MediaThumb file={row} className="h-9 w-9 rounded-md" />
          <span className="min-w-0">
            <span className="text-fg block truncate font-medium" title={fileName(row)}>
              {fileName(row)}
            </span>
            <span className="text-fg-subtle block truncate text-xs">{row.url}</span>
          </span>
        </span>
      ),
    },
    {
      id: "kind",
      header: "Type",
      type: "enum",
      size: 110,
      options: KIND_OPTIONS,
      cell: (row) => KIND_LABEL[kindOf(row)],
    },
    {
      id: "extension",
      header: "Format",
      type: "enum",
      size: 100,
      options: EXTENSIONS.map((e) => ({ value: e, label: e.toUpperCase() })),
      cell: (row) => <span className="text-fg-subtle uppercase">{row.extension || "—"}</span>,
    },
    {
      id: "size",
      header: "Size (KB)",
      type: "number",
      size: 110,
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatBytes(row.size)}</span>,
    },
    {
      id: "width",
      header: "Dimensions",
      type: "number",
      size: 120,
      align: "right",
      cell: (row) => <span className="text-fg-subtle tabular-nums">{dimensions(row) ?? "—"}</span>,
    },
    {
      id: "height",
      header: "Height",
      type: "number",
      size: 90,
      align: "right",
      defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{row.height ?? "—"}</span>,
    },
    {
      id: "folder",
      header: "Folder",
      type: "enum",
      size: 130,
      options: folders.map((f) => ({ value: f.folder, label: `${f.folder} (${f.count})` })),
      cell: (row) => row.folder,
    },
    {
      id: "alt",
      header: "Alt text",
      type: "text",
      size: 200,
      cell: (row) =>
        row.alt ? (
          <span className="text-fg-subtle">{row.alt}</span>
        ) : isImage(row) ? (
          <span className="text-warning">Missing</span>
        ) : (
          muted
        ),
    },
    {
      id: "has_alt",
      header: "Has alt text",
      type: "bool",
      sortable: false,
      size: 110,
      defaultHidden: true,
      cell: (row) => (row.alt ? "Yes" : "No"),
    },
    {
      id: "uploaded_by",
      header: "Uploaded by",
      type: "text",
      size: 150,
      defaultHidden: true,
      cell: (row) => row.uploaded_by?.name ?? muted,
    },
    {
      id: "created_at",
      header: "Uploaded",
      type: "date",
      size: 130,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.created_at)}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      size: 96,
      align: "right",
      cell: rowActions,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Media library</h1>
      <MediaKpis stats={stats} active={active} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="media"
          defaultView="cards"
          cardGridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search files…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "file" : "files"}
          actions={
            canUpload && (
              <Tooltip label="Upload files" align="end">
                <Button
                  iconOnly
                  leftIcon={Upload}
                  aria-label="Upload files"
                  aria-expanded={showUpload || progress !== null}
                  onClick={() => setShowUpload(true)}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          selection={canDelete ? selection : undefined}
          onRowClick={(row) => setOpenId(row.id)}
          highlightId={openId}
          renderListItem={(row, slots) => <MediaListItem row={row} slots={slots} actions={rowActions(row)} />}
          renderCard={(row, slots) => <MediaCard row={row} slots={slots} actions={rowActions(row)} />}
          empty={
            <EmptyState
              icon={Images}
              title={filtered ? "No files match your filters" : "No files yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Upload images and documents to reuse them across the site."
              }
              action={
                !filtered &&
                canUpload && (
                  <Button leftIcon={Upload} onClick={() => setShowUpload(true)}>
                    Upload files
                  </Button>
                )
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="files"
            />
          }
        />
      </Card>

      <Modal
        open={showUpload || progress !== null}
        onClose={() => progress === null && setShowUpload(false)}
        variant="drawer"
        size="sm"
        title="Upload files"
        description={`Files will be added to “${uploadFolder}”.`}
        closeOnBackdrop={progress === null}
      >
        <UploadZone
          onFiles={upload}
          progress={progress}
          title="Click to choose files or drag them here"
          hint="Images and documents up to 10 MB"
        />
      </Modal>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button size="sm" variant="danger" leftIcon={Trash2} onClick={removeSelected}>
          Delete
        </Button>
      </BulkActionBar>

      <MediaDetails
        file={opened}
        canEdit={canUpload}
        canDelete={canDelete}
        onClose={() => setOpenId(null)}
        onChanged={refresh}
        onDelete={removeOne}
      />
    </>
  );
}
