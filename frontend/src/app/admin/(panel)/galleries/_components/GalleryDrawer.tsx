"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckSquare,
  Images,
  Pencil,
  Star,
  Trash2,
  Video,
  X,
  Clapperboard,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Modal,
  Skeleton,
  StatusBadge,
} from "@/app/admin/_components/ui/index";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { UploadZone } from "@/app/admin/(panel)/media/_components/UploadZone";
import { galleriesApi, type GalleryDetail, type GalleryItem } from "@/app/admin/_lib/api/galleriesApi";
import type { ApiResponse } from "@/app/admin/_lib/api/types";
import { apiErrorMessage, apiErrorStatus, apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDate } from "@/lib/utils";

import GalleryModal from "./GalleryModal";
import { ItemModal, YoutubeModal } from "./ItemModals";
import { ItemTile } from "./ItemTile";

import { WEBSITE_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
const MAX_PER_REQUEST = 50;

export function GalleryDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const selection = useBulkSelection();
  const sort = useDragSort({ axis: "x", onMove: (from, to) => reorder(from, to) });
  const [selecting, setSelecting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [addingVideo, setAddingVideo] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);

  const queryKey = ["galleries", "detail", id];
  const {
    data: gallery,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => galleriesApi.get(id!),
    enabled: !!id && can(PERM.GALLERIES_VIEW),
  });
  const open = id !== null && can(PERM.GALLERIES_VIEW);

  if (!gallery || gallery.id !== id) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        variant="drawer"
        size="2xl"
        title="Gallery"
        bodyClassName="bg-page"
      >
        {error && !isLoading ? (
          <Card>
            <EmptyState
              icon={Images}
              title={apiErrorStatus(error) === 404 ? "Gallery not found" : "Couldn't load this gallery"}
              description="It may have been deleted."
            />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]" aria-busy>
            <Skeleton className="h-80" />
            <Skeleton className="h-96" />
          </div>
        )}
      </Modal>
    );
  }
  const galleryId = gallery.id;

  const canEdit = can(PERM.GALLERIES_UPDATE);
  const items = gallery.items;

  const apply = (detail: GalleryDetail) => {
    queryClient.setQueryData(queryKey, detail);
    queryClient.invalidateQueries({ queryKey: [QK.GALLERIES], predicate: (q) => q.queryKey[1] !== "detail" });
  };

  const run = async (fn: () => Promise<ApiResponse<GalleryDetail>>, fallback: string, quiet = false) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!quiet) toast.success(res.message ?? "Done");
      apply(res.data);
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, fallback));
      queryClient.invalidateQueries({ queryKey });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length < files.length)
      toast.warning(`${files.length - images.length} non-image file(s) skipped`);
    if (!images.length) return;
    setProgress(0);
    try {
      let last: GalleryDetail | null = null;
      for (let i = 0; i < images.length; i += MAX_PER_REQUEST) {
        const batch = images.slice(i, i + MAX_PER_REQUEST);
        const res = await galleriesApi.upload(galleryId, batch, (p) =>
          setProgress(Math.round(((i + (p / 100) * batch.length) / images.length) * 100))
        );
        last = res.data;
      }
      toast.success(`${images.length} image(s) added`);
      if (last) apply(last);
    } catch (err) {
      toast.error(apiFieldErrors(err).files ?? apiErrorMessage(err, "Upload failed"));
      queryClient.invalidateQueries({ queryKey });
    } finally {
      setProgress(null);
    }
  };

  const reorder = (from: number, to: number) => {
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    queryClient.setQueryData<GalleryDetail>(queryKey, {
      ...gallery,
      items: ids.map((x) => items.find((i) => i.id === x)!),
    });
    run(() => galleriesApi.reorderItems(galleryId, ids), "Couldn't save the order", true);
  };

  const removeItem = async (item: GalleryItem) => {
    const ok = await confirm({
      title: "Remove item?",
      message: (
        <>
          <b>{item.title || "This item"}</b> will be removed from the gallery
          {item.type === "image" ? " and the image file deleted" : ""}.
        </>
      ),
      confirmLabel: "Remove",
    });
    if (ok) run(() => galleriesApi.removeItem(galleryId, item.id), "Couldn't remove item");
  };

  const removeSelected = async () => {
    const ok = await confirm({
      title: `Remove ${selection.count} item(s)?`,
      message: "Selected items will be removed and their image files deleted. This can't be undone.",
      confirmLabel: "Remove",
    });
    if (
      ok &&
      (await run(() => galleriesApi.bulkDeleteItems(galleryId, selection.ids), "Couldn't remove items"))
    ) {
      selection.clear();
      setSelecting(false);
    }
  };

  const stopSelecting = () => {
    setSelecting(false);
    selection.clear();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        variant="drawer"
        size="2xl"
        bodyClassName="bg-page"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {gallery.title}
            <Badge>{gallery.items_count} item(s)</Badge>
          </span>
        }
        description={gallery.description || WEBSITE_ROUTES.GALLERY_ITEM(gallery.slug)}
        headerActions={
          canEdit && (
            <Button size="sm" variant="secondary" leftIcon={Pencil} onClick={() => setEditingDetails(true)}>
              Edit details
            </Button>
          )
        }
      >
        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card>
            <div className="bg-page aspect-[4/3] overflow-hidden rounded-t-xl">
              {gallery.cover_image ? (
                <img src={gallery.cover_image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="text-fg-subtle flex h-full items-center justify-center">
                  <Images size={32} />
                </div>
              )}
            </div>
            <CardBody className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={gallery.status} />
                {gallery.is_featured && (
                  <Badge tone="purple">
                    <Star size={11} className="fill-current" /> Featured
                  </Badge>
                )}
              </div>
              <dl className="text-fg-muted space-y-2">
                <div className="flex items-center gap-2">
                  <Images size={14} className="text-fg-subtle" /> {gallery.image_count} photo(s)
                </div>
                <div className="flex items-center gap-2">
                  <Video size={14} className="text-fg-subtle" /> {gallery.youtube_count} video(s)
                </div>
                {gallery.event_date && (
                  <div className="flex items-center gap-2">
                    <CalendarDays size={14} className="text-fg-subtle" /> {formatDate(gallery.event_date)}
                  </div>
                )}
              </dl>
              {!gallery.stored_cover_image && items.length > 0 && (
                <p className="text-fg-subtle text-xs">
                  Cover is the first photo. Use ★ on an item to choose one.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={Images}
              title="Photos & videos"
              description={
                canEdit ? "Drag items to reorder. Hover one to set the cover, edit or remove it." : undefined
              }
              actions={
                <>
                  {canEdit && items.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={selecting ? X : CheckSquare}
                      onClick={selecting ? stopSelecting : () => setSelecting(true)}
                    >
                      {selecting ? "Done" : "Select"}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={Clapperboard}
                      onClick={() => setAddingVideo(true)}
                    >
                      Add YouTube video
                    </Button>
                  )}
                </>
              }
            />
            <CardBody className="space-y-4">
              {canEdit && (
                <UploadZone
                  compact
                  accept="image/*"
                  onFiles={upload}
                  progress={progress}
                  title="Click to add photos or drag them here"
                  hint="JPG, PNG, WEBP or GIF · select several at once"
                />
              )}
              {selecting && (
                <div className="flex items-center gap-3 text-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => selection.togglePage(items.map((i) => i.id))}
                  >
                    {selection.pageState(items.map((i) => i.id)) === "all" ? "Deselect all" : "Select all"}
                  </Button>
                  <span className="text-fg-subtle">{selection.count} selected</span>
                  {selection.count > 0 && (
                    <Button
                      size="sm"
                      variant="danger"
                      leftIcon={Trash2}
                      loading={busy}
                      onClick={removeSelected}
                      className="ml-auto"
                    >
                      Remove selected
                    </Button>
                  )}
                </div>
              )}
              {items.length ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map((item, index) => (
                    <ItemTile
                      key={item.id}
                      item={item}
                      isCover={!!gallery.stored_cover_image && gallery.stored_cover_image === item.thumbnail}
                      selecting={selecting}
                      selected={selection.isSelected(item.id)}
                      onSelect={() => selection.toggle(item.id)}
                      canEdit={canEdit}
                      busy={busy}
                      index={index}
                      sort={canEdit && !selecting && !busy ? sort : undefined}
                      onCover={() =>
                        run(() => galleriesApi.setCover(galleryId, item.id), "Couldn't set cover")
                      }
                      onEdit={() => setEditingItem(item)}
                      onDelete={() => removeItem(item)}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={Images}
                  title="No items yet"
                  description="Upload photos or add a YouTube video to fill this gallery."
                />
              )}
            </CardBody>
          </Card>
        </div>
      </Modal>

      <GalleryModal
        key={editingDetails ? "open" : "closed"}
        open={editingDetails}
        gallery={gallery}
        onClose={() => setEditingDetails(false)}
        onSaved={(saved) => {
          setEditingDetails(false);
          apply(saved);
        }}
      />
      <YoutubeModal
        open={addingVideo}
        galleryId={galleryId}
        onClose={() => setAddingVideo(false)}
        onSaved={(detail) => {
          setAddingVideo(false);
          apply(detail);
        }}
      />
      <ItemModal
        galleryId={galleryId}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={() => {
          setEditingItem(null);
          queryClient.invalidateQueries({ queryKey });
        }}
      />
    </>
  );
}
