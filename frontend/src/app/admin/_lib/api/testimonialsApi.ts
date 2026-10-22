import { createCrudApi, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { Status } from "./types";

export interface Testimonial {
  id: number;
  name: string;
  designation: string | null;
  company: string | null;
  quote: string;
  photo: string | null;
  rating: number | null;
  is_featured: boolean;
  sort_order: number;
  status: Status;
  created_at: string;
  updated_at: string;
}

export interface TestimonialPayload {
  name: string;
  designation?: string | null;
  company?: string | null;
  quote: string;
  photo?: string | null;
  rating?: number | null;
  is_featured: boolean;
  sort_order: number;
  status: Status;
}

export interface TestimonialStats {
  total: number;
  active: number;
  inactive: number;
  featured: number;
  featured_live: number;
  rated: number;
  average_rating: number | null;
  by_rating: Record<string, number>;
  this_week: number;
  last_week: number;
}

const E = ADMIN_ENDPOINTS.TESTIMONIALS;

export const testimonialsApi = {
  ...createCrudApi<Testimonial, TestimonialPayload>(E),
  reorder: (ids: number[]) => send<null>("post", E.REORDER, { ids }),
  stats: () => getOne<TestimonialStats>(E.STATS),
};
