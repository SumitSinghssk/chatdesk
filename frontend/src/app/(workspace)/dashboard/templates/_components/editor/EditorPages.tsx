"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileText, Lock } from "lucide-react";

import { Button, Card, EmptyState, ErrorBanner, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { TEMPLATES_QK, templatesApi, type Template } from "../../../_lib/templatesApi";
import { SAMPLES } from "../samples";
import { statusOf } from "../labels";
import { draftOf, TemplateEditor } from "./TemplateEditor";

function useTemplate(id: number | null) {
  return useQuery({
    queryKey: TEMPLATES_QK.ONE(id ?? 0),
    queryFn: async () => (await templatesApi.get(id!)).data,
    enabled: !!id,
  });
}

/** /dashboard/templates/new · ?sample=<key> starts from the library · ?from=<id> duplicates */
export function NewTemplate() {
  const params = useSearchParams();
  const fromId = Number(params.get("from")) || null;
  const sample = SAMPLES.find((s) => s.key === params.get("sample"));
  const { data: source, error, isLoading } = useTemplate(fromId);

  if (fromId && isLoading) return <Spinner className="h-full" />;
  if (fromId && error) return <ErrorBanner message={errorMessage(error)} />;
  if (source) {
    const seed = { ...draftOf(source), name: `${source.name}_copy`.slice(0, 512) };
    const copy = source.sample
      ? {
          key: `template:${source.id}`,
          url: templatesApi.sampleUrl(source.sample.path),
          mime: source.sample.mime,
          filename: source.sample.filename,
          size: source.sample.size,
        }
      : null;
    return <TemplateEditor key={`from-${source.id}`} seed={seed} seedSample={copy} />;
  }
  return <TemplateEditor key={sample?.key ?? "blank"} seed={sample?.template} />;
}

function Locked({ template }: { template: Template }) {
  const status = statusOf(template.status);
  return (
    <Card>
      <EmptyState
        icon={template.form.supported === false ? FileText : Lock}
        title={
          template.form.supported === false
            ? "Edit this template in WhatsApp Manager"
            : `${status.label} templates can't be edited`
        }
        description={
          template.form.supported === false
            ? "It uses parts (such as a carousel or flow) that this editor doesn't change yet. It still previews and sends here."
            : status.hint
        }
        action={
          <div className="flex gap-2">
            <Link href={CUSTOMER_ROUTES.TEMPLATES({ action: "edit", id: template.id })}>
              <Button variant="secondary">Back to template</Button>
            </Link>
            <Link href={CUSTOMER_ROUTES.TEMPLATE_NEW({ from: template.id })}>
              <Button>Duplicate instead</Button>
            </Link>
          </div>
        }
      />
    </Card>
  );
}

/** /dashboard/templates/<id>/edit */
export function EditTemplate({ id }: { id: number }) {
  const { data, error, isLoading } = useTemplate(id);
  if (isLoading) return <Spinner className="h-full" />;
  if (error || !data) return <ErrorBanner message={errorMessage(error ?? new Error("Template not found"))} />;
  if (!data.editable) return <Locked template={data} />;
  return <TemplateEditor key={data.id} template={data} />;
}
