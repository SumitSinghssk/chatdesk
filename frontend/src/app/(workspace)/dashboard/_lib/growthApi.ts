import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";

export interface FeedbackSettings {
  enabled: boolean;
  on_resolve: boolean;
  on_delivered: boolean;
  question: string;
  thanks_text: string;
  sorry_text: string;
  review_url: string | null;
  gap_days: number;
}

export type JourneyKind = "post_purchase" | "reorder" | "birthday";

export interface Journey {
  kind: JourneyKind;
  label: string;
  hint: string;
  enabled: boolean;
  template_id: number | null;
  delay_days: number;
  send_hour: number;
  sent_30_days: number;
}

export type SpendCategory = "marketing" | "utility" | "authentication" | "service";

export interface Spend {
  currency: string;
  rates: Record<SpendCategory, number>;
  monthly_budget: number | null;
  month: {
    spent: number;
    by_category: Record<SpendCategory, { messages: number; cost: number }>;
    used_percent: number | null;
  };
  previous_month: { spent: number };
}

const G = CUSTOMER_ENDPOINTS.GROWTH;

export const GROWTH_QK = {
  FEEDBACK: ["growth", "feedback"] as const,
  JOURNEYS: ["growth", "journeys"] as const,
  SPEND: ["growth", "spend"] as const,
};

export const growthApi = {
  feedback: () => request<FeedbackSettings>("GET", G.FEEDBACK),
  saveFeedback: (body: FeedbackSettings) => request<FeedbackSettings>("PUT", G.FEEDBACK, body),
  journeys: () => request<Journey[]>("GET", G.JOURNEYS),
  saveJourney: (
    kind: JourneyKind,
    body: { enabled: boolean; template_id: number | null; delay_days: number; send_hour: number }
  ) => request<Journey[]>("PUT", G.JOURNEY(kind), body),
  spend: () => request<Spend>("GET", G.SPEND),
  saveSpend: (body: {
    currency: string;
    rates: Partial<Record<SpendCategory, number>>;
    monthly_budget: number | null;
  }) => request<Spend>("PUT", G.SPEND, body),
};
