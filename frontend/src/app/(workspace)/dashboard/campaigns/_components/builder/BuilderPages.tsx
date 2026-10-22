"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";

import { Button, Card, EmptyState, ErrorBanner, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { CAMPAIGNS_QK, campaignsApi, type Segment } from "../../../_lib/campaignsApi";
import { SEGMENTS } from "../labels";
import { BLANK_SEED, CampaignBuilder, EMPTY_AUDIENCE, seedOf } from "./CampaignBuilder";

function useCampaign(id: number | null) {
  return useQuery({
    queryKey: CAMPAIGNS_QK.ONE(id ?? 0),
    queryFn: async () => (await campaignsApi.get(id!)).data,
    enabled: !!id,
  });
}

/**
 * /dashboard/campaigns/new
 *   ?from=<id>                      duplicate a campaign
 *   ?retarget=<id>&segment=not_read people from a campaign who did (or didn't do) something
 *   ?template=<id>                  start with a template
 *   ?contacts=1,2,3                 contacts picked on the Contacts page
 */
export function NewCampaign() {
  const params = useSearchParams();
  const sourceId = Number(params.get("from") || params.get("retarget")) || null;
  const retarget = !!params.get("retarget");
  const { data: source, error, isLoading } = useCampaign(sourceId);

  if (sourceId && isLoading) return <Spinner className="h-full" />;
  if (sourceId && error) return <ErrorBanner message={errorMessage(error)} />;

  if (source && retarget) {
    const segment = (params.get("segment") as Segment) || "not_read";
    const label = SEGMENTS.find((s) => s.value === segment)?.label.toLowerCase() ?? segment;
    const seed = {
      ...seedOf(source, true),
      name: `${source.name}: ${label}`.slice(0, 150),
      audience: { ...EMPTY_AUDIENCE, type: "campaign" as const, campaign_id: source.id, segment },
    };
    return <CampaignBuilder key={`retarget-${source.id}-${segment}`} seed={seed} />;
  }
  if (source) return <CampaignBuilder key={`from-${source.id}`} seed={seedOf(source, true)} />;

  const contacts = (params.get("contacts") ?? "").split(",").map(Number).filter(Boolean);
  const seed = {
    ...BLANK_SEED,
    template_id: Number(params.get("template")) || null,
    audience: contacts.length
      ? { ...EMPTY_AUDIENCE, type: "contacts" as const, contact_ids: contacts }
      : EMPTY_AUDIENCE,
  };
  return <CampaignBuilder key="new" seed={seed} />;
}

/** /dashboard/campaigns/<id>/edit (drafts and scheduled campaigns) */
export function EditCampaign({ id }: { id: number }) {
  const { data, error, isLoading } = useCampaign(id);
  if (isLoading) return <Spinner className="h-full" />;
  if (error || !data) return <ErrorBanner message={errorMessage(error ?? new Error("Campaign not found"))} />;
  if (!["draft", "scheduled"].includes(data.status)) {
    return (
      <Card>
        <EmptyState
          icon={Lock}
          title="This campaign has already started"
          description="Sent campaigns can't be changed. Duplicate it to send it again."
          action={
            <div className="flex gap-2">
              <Link href={CUSTOMER_ROUTES.CAMPAIGN(data.id)}>
                <Button variant="secondary">View report</Button>
              </Link>
              <Link href={CUSTOMER_ROUTES.CAMPAIGN_NEW({ from: data.id })}>
                <Button>Duplicate</Button>
              </Link>
            </div>
          }
        />
      </Card>
    );
  }
  return <CampaignBuilder key={data.id} campaign={data} seed={seedOf(data)} />;
}
