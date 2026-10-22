"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Globe, Search } from "lucide-react";

import { Button, Card, CardBody, CardHeader, Skeleton } from "@/app/admin/_components/ui/index";
import { seoApi } from "@/app/admin/_lib/api/seoApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";

import SeoModal from "@/app/admin/(panel)/seo/_components/SeoModal";

import { QK } from "@/config/query-keys";
export function SeoLinkCard({
  path,
  label,
  prefill,
}: {
  path: string | null;
  label: string;
  prefill?: { meta_title?: string; meta_description?: string; og_image?: string | null };
}) {
  const can = usePermissions();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: entry, isLoading } = useQuery({
    queryKey: [QK.SEO, "path", path],
    queryFn: () => seoApi.findByPath(path!),
    enabled: !!path && can(PERM.SEO_VIEW),
  });

  if (!can(PERM.SEO_VIEW)) return null;
  const canEdit = entry ? can(PERM.SEO_UPDATE) : can(PERM.SEO_CREATE);

  return (
    <Card>
      <CardHeader icon={Search} title="SEO" description="Meta tags, social image, schema and FAQs." />
      <CardBody className="space-y-3">
        {!path ? (
          <p className="text-fg-subtle text-sm">Save first, then set up SEO for this URL.</p>
        ) : isLoading ? (
          <Skeleton className="h-10" />
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm">
              {entry ? (
                <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" aria-hidden />
              ) : (
                <Globe size={16} className="text-fg-subtle mt-0.5 shrink-0" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="text-fg block font-medium">
                  {entry ? "Custom SEO set" : "Using site defaults"}
                </span>
                <span className="text-fg-subtle block truncate text-xs">{entry?.meta_title || path}</span>
              </span>
            </p>
            {canEdit && (
              <Button variant="secondary" leftIcon={Search} className="w-full" onClick={() => setOpen(true)}>
                {entry ? "Edit SEO" : "Add SEO"}
              </Button>
            )}
            <p className="text-fg-subtle text-xs">
              If you change the slug, update the path in the SEO entry too.
            </p>
          </>
        )}
      </CardBody>

      {path && (
        <SeoModal
          open={open}
          entry={entry ?? null}
          defaults={{
            page: label,
            path,
            meta_title: prefill?.meta_title ?? "",
            meta_description: prefill?.meta_description ?? "",
            og_image: prefill?.og_image ?? null,
          }}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            queryClient.invalidateQueries({ queryKey: [QK.SEO] });
          }}
        />
      )}
    </Card>
  );
}
