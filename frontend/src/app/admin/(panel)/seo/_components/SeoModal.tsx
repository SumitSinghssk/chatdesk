"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { GripVertical, MessageCircleQuestion, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import {
  Button,
  EmptyState,
  ImageField,
  Input,
  Modal,
  Switch,
  Tabs,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { DEFAULT_SEO_PATH, seoApi, type SeoPage } from "@/app/admin/_lib/api/seoApi";
import { apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { applyServerErrors, emptyToNull } from "@/app/admin/_lib/form";
import { cn } from "@/lib/utils";

const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;
const MAX_FAQS = 100;

const isJson = (v: string) => {
  if (!v.trim()) return true;
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
};

const schema = z.object({
  page: z.string().trim().min(1, "Page label is required").max(150),
  path: z
    .string()
    .trim()
    .min(1, "Path is required")
    .max(500)
    .refine(
      (v) => v === DEFAULT_SEO_PATH || v.startsWith("/"),
      "Path must start with / (or be * for the site-wide default)"
    ),
  meta_title: z.string().max(255),
  meta_description: z.string().max(500),
  meta_keywords: z.string().max(500),
  og_image: z.string().nullable(),
  canonical_url: z.string().trim().max(1000),
  allow_indexing: z.boolean(),
  schema_markup: z.string().max(100_000).refine(isJson, "Schema must be valid JSON-LD"),
  faqs: z
    .array(
      z.object({
        question: z.string().trim().min(1, "Question is required").max(500),
        answer: z.string().trim().min(1, "Answer is required").max(5000),
      })
    )
    .max(MAX_FAQS),
  header_scripts: z.string().max(100_000),
  footer_scripts: z.string().max(100_000),
  custom_css: z.string().max(100_000),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  page: "",
  path: "",
  meta_title: "",
  meta_description: "",
  meta_keywords: "",
  og_image: null,
  canonical_url: "",
  allow_indexing: true,
  schema_markup: "",
  faqs: [],
  header_scripts: "",
  footer_scripts: "",
  custom_css: "",
};

type Tab = "general" | "search" | "social" | "schema" | "faqs" | "advanced";

const TAB_FIELDS: Record<Tab, (keyof Values)[]> = {
  general: ["page", "path"],
  search: ["meta_title", "meta_description", "meta_keywords", "canonical_url", "allow_indexing"],
  social: ["og_image"],
  schema: ["schema_markup"],
  faqs: ["faqs"],
  advanced: ["header_scripts", "footer_scripts", "custom_css"],
};
const TAB_ORDER = Object.keys(TAB_FIELDS) as Tab[];

const tabOfField = (field: string): Tab | undefined => {
  const root = field.split(".")[0] ?? "";
  return TAB_ORDER.find((tab) => (TAB_FIELDS[tab] as string[]).includes(root));
};

function firstErrorPath(errors: FieldErrors<Values>): string | undefined {
  for (const tab of TAB_ORDER) {
    for (const field of TAB_FIELDS[tab]) {
      const error = errors[field];
      if (!error) continue;
      if (field === "faqs" && Array.isArray(error)) {
        const index = error.findIndex(Boolean);
        if (index >= 0) return `faqs.${index}.${error[index]?.question ? "question" : "answer"}`;
      }
      return field;
    }
  }
  return undefined;
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-fg text-sm font-semibold">{title}</h3>
        {description && <p className="text-fg-subtle mt-0.5 text-xs">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Counter({ value, limit }: { value: string; limit: number }) {
  return (
    <span className={cn("tabular", value.length > limit ? "text-warning font-semibold" : "text-fg-subtle")}>
      {value.length}/{limit}
    </span>
  );
}

function SnippetPreview({ title, description, path }: { title: string; description: string; path: string }) {
  const host = typeof window !== "undefined" ? window.location.host : "example.com";
  const crumbs = path && path !== DEFAULT_SEO_PATH ? path.split("/").filter(Boolean) : [];
  const shownTitle = title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1)}…` : title;
  const shownDesc =
    description.length > DESCRIPTION_LIMIT ? `${description.slice(0, DESCRIPTION_LIMIT - 1)}…` : description;
  return (
    <div className="border-line bg-page rounded-xl border p-4" aria-label="Search result preview">
      <p className="text-fg-subtle mb-2 text-xs font-semibold tracking-wide uppercase">Google preview</p>
      <p className="text-fg-muted truncate text-xs">
        {host}
        {crumbs.map((c) => ` › ${c}`)}
      </p>
      <p className="text-info mt-0.5 truncate text-base">{shownTitle || "Page title"}</p>
      <p className="text-fg-muted mt-0.5 line-clamp-2 text-sm">
        {shownDesc || "Add a meta description to control the text shown under the title in search results."}
      </p>
    </div>
  );
}

function TabLabel({ text, error }: { text: string; error: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {error && <span className="h-1.5 w-1.5 rounded-full bg-red-500" role="img" aria-label="has errors" />}
    </span>
  );
}

export default function SeoModal({
  open,
  entry,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: SeoPage | null;
  defaults?: Partial<Pick<Values, "page" | "path" | "meta_title" | "meta_description" | "og_image">>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, control, formState, setError, setFocus } = form;
  const errors = formState.errors;
  const faqs = useFieldArray({ control, name: "faqs" });
  const faqSort = useDragSort({ onMove: (from, to) => faqs.move(from, to) });
  const [title, description, path, page] = useWatch({
    control,
    name: ["meta_title", "meta_description", "path", "page"],
  });
  const isDefault = entry?.is_default ?? false;

  const [tab, setTab] = useState<Tab>("general");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTab("general");
  }

  useEffect(() => {
    if (!open) return;
    reset(
      entry
        ? {
            page: entry.page,
            path: entry.path,
            meta_title: entry.meta_title ?? "",
            meta_description: entry.meta_description ?? "",
            meta_keywords: entry.meta_keywords ?? "",
            og_image: entry.og_image,
            canonical_url: entry.canonical_url ?? "",
            allow_indexing: entry.allow_indexing,
            schema_markup: entry.schema_markup ?? "",
            faqs: entry.faqs ?? [],
            header_scripts: entry.header_scripts ?? "",
            footer_scripts: entry.footer_scripts ?? "",
            custom_css: entry.custom_css ?? "",
          }
        : { ...EMPTY, ...defaults }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `defaults` is a fresh object each render; read it only on open
  }, [open, entry, reset]);

  const revealField = (field: string | undefined) => {
    const target = field ? tabOfField(field) : undefined;
    if (!field || !target) return;
    setTab(target);
    requestAnimationFrame(() => {
      try {
        setFocus(field as Parameters<typeof setFocus>[0]);
      } catch {}
    });
  };

  const onSubmit = handleSubmit(
    async (values) => {
      const payload = emptyToNull(values);
      try {
        const res = entry ? await seoApi.update(entry.id, payload) : await seoApi.create(payload);
        toast.success(res.message ?? "Saved");
        onSaved();
      } catch (err) {
        applyServerErrors(err, setError, "Couldn't save SEO entry");
        const fields = Object.keys(apiFieldErrors(err));
        revealField(TAB_ORDER.flatMap((t) => fields.filter((f) => tabOfField(f) === t))[0]);
      }
    },
    (invalid) => revealField(firstErrorPath(invalid))
  );

  const tabLabel = (t: Tab, text: string) => (
    <TabLabel text={text} error={TAB_FIELDS[t].some((field) => !!errors[field])} />
  );
  const mono = "font-mono text-xs";
  const addFaq = () =>
    faqs.append({ question: "", answer: "" }, { focusName: `faqs.${faqs.fields.length}.question` });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      bodyClassName="p-0"
      title={entry ? `Edit SEO · ${entry.page}` : "New SEO entry"}
      description={
        isDefault
          ? "Site-wide defaults, used for any page without its own entry."
          : "Meta tags, social image and structured data for one page."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="seo-form" loading={formState.isSubmitting}>
            {entry ? "Save changes" : "Create entry"}
          </Button>
        </>
      }
    >
      <div className="bg-surface sticky top-0 z-10 px-5 pt-1">
        <Tabs<Tab>
          className="mb-0"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "general", label: tabLabel("general", "General") },
            { value: "search", label: tabLabel("search", "Search appearance") },
            { value: "social", label: tabLabel("social", "Social") },
            { value: "schema", label: tabLabel("schema", "Schema") },
            { value: "faqs", label: tabLabel("faqs", "FAQs"), count: faqs.fields.length },
            { value: "advanced", label: tabLabel("advanced", "Advanced") },
          ]}
        />
      </div>

      <form id="seo-form" onSubmit={onSubmit} className="p-5" noValidate>
        <div role="tabpanel" aria-label="General" hidden={tab !== "general"}>
          <FormSection title="Page" description="Which URL on the website these settings apply to.">
            <Input
              label="Page label"
              required
              placeholder="About us"
              error={errors.page?.message}
              {...register("page")}
            />
            <Input
              label="Path"
              required
              placeholder="/about"
              readOnly={isDefault}
              hint={
                isDefault
                  ? "The default entry's path can't be changed."
                  : "/about, or * for the site-wide default"
              }
              error={errors.path?.message}
              className="font-mono"
              {...register("path")}
            />
          </FormSection>
        </div>

        <div role="tabpanel" aria-label="Search appearance" hidden={tab !== "search"}>
          <FormSection
            title="Search appearance"
            description="How this page looks in Google and other search engines."
          >
            <Input
              label="Meta title"
              placeholder={page || "Page title"}
              hint={<Counter value={title ?? ""} limit={TITLE_LIMIT} />}
              error={errors.meta_title?.message}
              {...register("meta_title")}
            />
            <Textarea
              label="Meta description"
              rows={3}
              hint={<Counter value={description ?? ""} limit={DESCRIPTION_LIMIT} />}
              error={errors.meta_description?.message}
              {...register("meta_description")}
            />
            <Input
              label="Meta keywords"
              placeholder="keyword one, keyword two"
              error={errors.meta_keywords?.message}
              {...register("meta_keywords")}
            />
            <Input
              label="Canonical URL"
              type="url"
              placeholder="https://example.com/about"
              hint="Leave blank to use the page's own URL."
              error={errors.canonical_url?.message}
              {...register("canonical_url")}
            />
            <Controller
              control={control}
              name="allow_indexing"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onChange={field.onChange}
                  label="Allow search engines to index this page"
                  hint="Turn off to add a noindex tag."
                />
              )}
            />
            <SnippetPreview title={title || page || ""} description={description ?? ""} path={path ?? ""} />
          </FormSection>
        </div>

        <div role="tabpanel" aria-label="Social" hidden={tab !== "social"}>
          <FormSection
            title="Social sharing"
            description="Image used when the page is shared on social media."
          >
            <Controller
              control={control}
              name="og_image"
              render={({ field }) => (
                <ImageField
                  label="Open Graph image"
                  value={field.value}
                  onChange={field.onChange}
                  folder="seo"
                  hint="Recommended 1200 × 630 px."
                  error={errors.og_image?.message}
                  className="max-w-md"
                />
              )}
            />
          </FormSection>
        </div>

        <div role="tabpanel" aria-label="Schema" hidden={tab !== "schema"}>
          <FormSection
            title="Structured data"
            description="Rich results such as breadcrumbs or organisation info."
          >
            <Textarea
              label="Schema markup (JSON-LD)"
              rows={14}
              spellCheck={false}
              className={mono}
              placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Organization"\n}'}
              hint="Paste the JSON only, without <script> tags. Must be valid JSON. FAQs are added as FAQPage schema automatically."
              error={errors.schema_markup?.message}
              {...register("schema_markup")}
            />
          </FormSection>
        </div>

        <div role="tabpanel" aria-label="FAQs" hidden={tab !== "faqs"}>
          <FormSection title="FAQs" description="Shown on the page and added as FAQPage schema.">
            {faqs.fields.length === 0 ? (
              <EmptyState
                icon={MessageCircleQuestion}
                className="border-line rounded-xl border border-dashed py-10"
                title="No FAQs yet"
                description="Add questions and answers to show on the page and earn FAQ rich results."
                action={
                  <Button size="sm" variant="secondary" leftIcon={Plus} onClick={addFaq}>
                    Add FAQ
                  </Button>
                }
              />
            ) : (
              <>
                <ol className="space-y-3">
                  {faqs.fields.map((field, i) => (
                    <li
                      key={field.id}
                      data-sort-item
                      {...faqSort.itemProps(i)}
                      className={cn(
                        "border-line bg-page relative space-y-3 rounded-xl border p-3 transition",
                        faqSort.isDragging(i) && "opacity-40"
                      )}
                    >
                      {faqSort.indicator(i) && (
                        <span
                          aria-hidden
                          className={cn(
                            "bg-primary pointer-events-none absolute inset-x-0 h-0.5 rounded-full",
                            faqSort.indicator(i) === "before" ? "-top-2" : "-bottom-2"
                          )}
                        />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          {...faqSort.handleProps(i)}
                          title="Drag to reorder"
                          className="text-fg-subtle flex cursor-grab items-center gap-1.5 text-xs font-semibold active:cursor-grabbing"
                        >
                          <GripVertical size={14} aria-hidden /> FAQ {i + 1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            leftIcon={Trash2}
                            aria-label={`Remove FAQ ${i + 1}`}
                            title="Remove"
                            className="hover:bg-danger-soft hover:text-danger"
                            onClick={() => faqs.remove(i)}
                          />
                        </div>
                      </div>
                      <Input
                        label="Question"
                        required
                        error={errors.faqs?.[i]?.question?.message}
                        {...register(`faqs.${i}.question`)}
                      />
                      <Textarea
                        label="Answer"
                        required
                        rows={3}
                        error={errors.faqs?.[i]?.answer?.message}
                        {...register(`faqs.${i}.answer`)}
                      />
                    </li>
                  ))}
                </ol>
                {(errors.faqs?.message || errors.faqs?.root?.message) && (
                  <p role="alert" className="text-danger text-xs font-medium">
                    {errors.faqs.message || errors.faqs.root?.message}
                  </p>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Plus}
                  disabled={faqs.fields.length >= MAX_FAQS}
                  onClick={addFaq}
                >
                  Add FAQ
                </Button>
              </>
            )}
          </FormSection>
        </div>

        <div role="tabpanel" aria-label="Advanced" hidden={tab !== "advanced"}>
          <FormSection title="Advanced" description="Extra code injected only on this page.">
            <Textarea
              label="Header scripts"
              rows={6}
              spellCheck={false}
              className={mono}
              hint="Added inside <head>."
              error={errors.header_scripts?.message}
              {...register("header_scripts")}
            />
            <Textarea
              label="Footer scripts"
              rows={6}
              spellCheck={false}
              className={mono}
              hint="Added before </body>."
              error={errors.footer_scripts?.message}
              {...register("footer_scripts")}
            />
            <Textarea
              label="Custom CSS"
              rows={6}
              spellCheck={false}
              className={mono}
              hint="Plain CSS, without <style> tags."
              error={errors.custom_css?.message}
              {...register("custom_css")}
            />
          </FormSection>
        </div>
      </form>
    </Modal>
  );
}
