"use client";

import { useEffect } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button, ImageField, Input, Modal, Select, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { LabelWithCount } from "@/app/admin/(panel)/blogs/_components/CharCount";
import { teamApi, type TeamMember } from "@/app/admin/_lib/api/teamApi";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";

export const SOCIAL_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "X / Twitter" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "github", label: "GitHub" },
  { value: "youtube", label: "YouTube" },
  { value: "website", label: "Website" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "inactive", label: "Inactive", dot: "bg-slate-400" },
];

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(150),
  designation: z.string().trim().max(150),
  department: z.string().trim().max(150),
  bio: z.string().trim().max(3000, "Bio must be at most 3000 characters"),
  photo: z.string().nullable(),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  phone: z.string().trim().max(30),
  social_links: z
    .array(
      z.object({
        platform: z.string().min(1, "Pick a network"),
        url: z
          .string()
          .trim()
          .regex(/^https?:\/\//i, "Link must start with http:// or https://")
          .max(500),
      })
    )
    .max(10),
  is_featured: z.boolean(),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  name: "",
  designation: "",
  department: "",
  bio: "",
  photo: null,
  email: "",
  phone: "",
  social_links: [],
  is_featured: false,
  status: "active",
};

export default function TeamMemberModal({
  open,
  member,
  departments,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: TeamMember | null;
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError } = form;
  const errors = formState.errors;
  const bio = useWatch({ control, name: "bio" });
  const links = useFieldArray({ control, name: "social_links" });

  useEffect(() => {
    if (!open) return;
    reset(
      member
        ? {
            name: member.name,
            designation: member.designation ?? "",
            department: member.department ?? "",
            bio: member.bio ?? "",
            photo: member.photo,
            email: member.email ?? "",
            phone: member.phone ?? "",
            social_links: member.social_links ?? [],
            is_featured: member.is_featured,
            status: member.status,
          }
        : EMPTY
    );
  }, [open, member, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const payload = { ...emptyToNull(values), social_links: values.social_links };
    try {
      const res = member
        ? await teamApi.update(member.id, { ...payload, sort_order: member.sort_order })
        : await teamApi.create(payload);
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save team member");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={member ? "Edit team member" : "New team member"}
      description="People shown on the website's team section."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="team-member-form" loading={formState.isSubmitting}>
            {member ? "Save changes" : "Add team member"}
          </Button>
        </>
      }
    >
      <form id="team-member-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
          <Controller
            control={control}
            name="photo"
            render={({ field }) => (
              <ImageField
                label="Photo"
                value={field.value}
                onChange={field.onChange}
                folder="team"
                aspect="aspect-square"
                hint="Square"
              />
            )}
          />
          <div className="space-y-4">
            <Input label="Name" required error={errors.name?.message} {...register("name")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Role / designation"
                placeholder="e.g. Head of Design"
                error={errors.designation?.message}
                {...register("designation")}
              />
              <Input
                label="Department"
                placeholder="e.g. Design"
                list="team-departments"
                error={errors.department?.message}
                {...register("department")}
              />
              <datalist id="team-departments">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        <Textarea
          label={<LabelWithCount label="Bio" count={bio.trim().length} max={3000} />}
          rows={4}
          error={errors.bio?.message}
          {...register("bio")}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
          <Input label="Phone" type="tel" error={errors.phone?.message} {...register("phone")} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-fg-muted text-[13px] font-medium">Social links</p>
            {links.fields.length < 10 && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={Plus}
                onClick={() => links.append({ platform: "linkedin", url: "" })}
              >
                Add link
              </Button>
            )}
          </div>
          {links.fields.length === 0 && (
            <p className="text-fg-subtle text-xs">No social links. Add LinkedIn, X, GitHub and more.</p>
          )}
          {links.fields.map((item, index) => (
            <div key={item.id} className="grid grid-cols-[9rem_minmax(0,1fr)_auto] items-start gap-2">
              <Controller
                control={control}
                name={`social_links.${index}.platform`}
                render={({ field }) => (
                  <Select
                    options={SOCIAL_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-label="Network"
                  />
                )}
              />
              <Input
                placeholder="https://"
                aria-label="Link"
                error={errors.social_links?.[index]?.url?.message}
                {...register(`social_links.${index}.url`)}
              />
              <Button
                iconOnly
                variant="ghost"
                leftIcon={Trash2}
                aria-label="Remove link"
                onClick={() => links.remove(index)}
                className="text-fg-faint hover:text-danger"
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
              />
            )}
          />
          <Controller
            control={control}
            name="is_featured"
            render={({ field }) => (
              <Switch
                label="Featured"
                hint="Show on the home page team section."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
      </form>
    </Modal>
  );
}
