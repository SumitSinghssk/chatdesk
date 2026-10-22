"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { profileApi, SOCIAL_KEYS, type SocialKey } from "@/app/admin/_lib/api/profileApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { applyServerErrors } from "@/app/admin/_lib/form";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/app/admin/_store/authStore";

const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || /^https?:\/\//.test(v), "Enter a full URL starting with http:// or https://");

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(150),
  phone: z.string().trim().max(20),
  bio: z.string().max(2000),
  social_links: z.object(
    Object.fromEntries(SOCIAL_KEYS.map((k) => [k, url])) as Record<SocialKey, typeof url>
  ),
});
type Values = z.infer<typeof schema>;

const SOCIAL_LABELS: Record<SocialKey, { label: string; placeholder: string }> = {
  twitter: { label: "X / Twitter", placeholder: "https://x.com/username" },
  linkedin: { label: "LinkedIn", placeholder: "https://linkedin.com/in/username" },
  github: { label: "GitHub", placeholder: "https://github.com/username" },
  instagram: { label: "Instagram", placeholder: "https://instagram.com/username" },
  facebook: { label: "Facebook", placeholder: "https://facebook.com/username" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@channel" },
};

export function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, reset, formState, setError } = form;

  useEffect(() => {
    if (!user) return;
    reset({
      name: user.name,
      phone: user.phone ?? "",
      bio: user.bio ?? "",
      social_links: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, user.social_links?.[k] ?? ""])) as Record<
        SocialKey,
        string
      >,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await profileApi.update({
        name: values.name,
        phone: values.phone || null,
        bio: values.bio || null,
        social_links: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, values.social_links[k] || null])),
      });
      setUser(res.data);
      reset(values);
      toast.success(res.message ?? "Profile updated");
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't update profile");
    }
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setAvatarBusy(true);
    try {
      const res = await profileApi.uploadAvatar(file);
      setUser(res.data);
      toast.success(res.message ?? "Profile photo updated");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't upload photo"));
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    if (
      !(await confirm({
        title: "Remove profile photo?",
        confirmLabel: "Remove",
        message: "Your initials will be shown instead.",
      }))
    )
      return;
    setAvatarBusy(true);
    try {
      const res = await profileApi.removeAvatar();
      setUser(res.data);
      toast.success(res.message ?? "Profile photo removed");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't remove photo"));
    } finally {
      setAvatarBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="self-start">
        <CardBody className="flex flex-col items-center py-6 text-center">
          <Avatar name={user.name} src={user.avatar} size={96} />
          <p className="text-fg mt-3 text-base font-semibold">{user.name}</p>
          <p className="text-fg-subtle text-sm">{user.email}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {user.role && <Badge tone="blue">{user.role.name.replace(/_/g, " ")}</Badge>}
            {user.two_factor_enabled && <Badge tone="green">2FA on</Badge>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload profile photo"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={Camera}
              loading={avatarBusy}
              onClick={() => fileRef.current?.click()}
            >
              {user.avatar ? "Change photo" : "Upload photo"}
            </Button>
            {user.avatar && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={Trash2}
                disabled={avatarBusy}
                onClick={removeAvatar}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-fg-subtle mt-2 text-xs">JPG, PNG or WebP. A square image works best.</p>
          <dl className="border-line mt-5 w-full space-y-2 border-t pt-4 text-left text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-fg-subtle">Member since</dt>
              <dd className="text-fg">{formatDate(user.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-fg-subtle">Last sign-in</dt>
              <dd className="text-fg">{formatDate(user.last_login_at)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Personal details"
          description="Your name and contact details as other admins see them."
        />
        <form onSubmit={onSubmit} noValidate>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                required
                autoComplete="name"
                error={formState.errors.name?.message}
                {...register("name")}
              />
              <Input
                label="Email"
                value={user.email}
                disabled
                readOnly
                hint="Ask an administrator to change your email."
              />
              <Input
                label="Phone"
                type="tel"
                autoComplete="tel"
                error={formState.errors.phone?.message}
                {...register("phone")}
              />
            </div>
            <Textarea label="Bio" rows={4} error={formState.errors.bio?.message} {...register("bio")} />

            <div className="border-line border-t pt-4">
              <h3 className="text-fg text-sm font-semibold">Social links</h3>
              <p className="text-fg-subtle mb-3 text-xs">Optional. Shown on your author profile.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL_KEYS.map((key) => (
                  <Input
                    key={key}
                    id={`social-${key}`}
                    type="url"
                    label={SOCIAL_LABELS[key].label}
                    placeholder={SOCIAL_LABELS[key].placeholder}
                    error={formState.errors.social_links?.[key]?.message}
                    {...register(`social_links.${key}`)}
                  />
                ))}
              </div>
            </div>
          </CardBody>
          <div className="border-line flex justify-end gap-2 border-t px-4 py-3">
            <Button type="submit" loading={formState.isSubmitting} disabled={!formState.isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
