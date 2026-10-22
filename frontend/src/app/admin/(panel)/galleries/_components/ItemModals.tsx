"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, Input, Modal, Textarea } from "@/app/admin/_components/ui/index";
import { galleriesApi, type GalleryDetail, type GalleryItem } from "@/app/admin/_lib/api/galleriesApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

const itemSchema = z.object({
  title: z.string().trim().max(255),
  caption: z.string().max(2000),
});
const youtubeSchema = itemSchema.extend({ url: z.string().trim().min(5, "Paste a YouTube link").max(500) });
type ItemValues = z.infer<typeof itemSchema>;
type YoutubeValues = z.infer<typeof youtubeSchema>;

export function ItemModal({
  galleryId,
  item,
  onClose,
  onSaved,
}: {
  galleryId: number;
  item: GalleryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { register, handleSubmit, reset, formState, setError } = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: { title: "", caption: "" },
  });

  useEffect(() => {
    if (item) reset({ title: item.title ?? "", caption: item.caption ?? "" });
  }, [item, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!item) return;
    try {
      const res = await galleriesApi.updateItem(galleryId, item.id, emptyToNull(values));
      toast.success(res.message ?? "Item updated");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't update item");
    }
  });

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      size="sm"
      title="Edit item"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="gallery-item-form" loading={formState.isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="gallery-item-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {item?.thumbnail && (
          <img
            src={item.thumbnail}
            alt=""
            className="border-line aspect-video w-full rounded-lg border object-cover"
          />
        )}
        <Input label="Title" error={formState.errors.title?.message} {...register("title")} />
        <Textarea
          label="Caption"
          rows={3}
          error={formState.errors.caption?.message}
          {...register("caption")}
        />
      </form>
    </Modal>
  );
}

const YT_EMPTY: YoutubeValues = { url: "", title: "", caption: "" };

export function YoutubeModal({
  open,
  galleryId,
  onClose,
  onSaved,
}: {
  open: boolean;
  galleryId: number;
  onClose: () => void;
  onSaved: (gallery: GalleryDetail) => void;
}) {
  const { register, handleSubmit, reset, formState, setError } = useForm<YoutubeValues>({
    resolver: zodResolver(youtubeSchema),
    defaultValues: YT_EMPTY,
  });

  useEffect(() => {
    if (open) reset(YT_EMPTY);
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await galleriesApi.addYoutube(galleryId, emptyToNull(values) as YoutubeValues);
      toast.success(res.message ?? "Video added");
      onSaved(res.data);
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't add video");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Add YouTube video"
      description="Paste a link like youtube.com/watch?v=… or youtu.be/…"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="youtube-form" loading={formState.isSubmitting}>
            Add video
          </Button>
        </>
      }
    >
      <form id="youtube-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Video URL"
          required
          type="url"
          autoFocus
          placeholder="https://www.youtube.com/watch?v=…"
          error={formState.errors.url?.message}
          {...register("url")}
        />
        <Input label="Title" error={formState.errors.title?.message} {...register("title")} />
        <Textarea
          label="Caption"
          rows={2}
          error={formState.errors.caption?.message}
          {...register("caption")}
        />
      </form>
    </Modal>
  );
}
