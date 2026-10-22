import { getOne } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";

export interface DashboardData {
  greeting_name: string;
  stats: {
    enquiries_this_week: number;
    enquiries_prev_week: number;
    unread_enquiries: number;
    published_blogs: number;
    draft_blogs: number;
    published_pages: number;
    active_users: number;
    testimonials: number;
  };
  enquiries_chart: { date: string; total: number }[];
  recent_enquiries: {
    id: number;
    reference: string;
    name: string;
    subject: string | null;
    status: string;
    created_at: string;
  }[];
  latest_blogs: { id: number; title: string; slug: string; status: string; published_at: string | null }[];
  recent_activity: {
    id: number;
    action: string;
    description: string | null;
    subject_type: string | null;
    subject_label: string | null;
    user: string | null;
    created_at: string;
  }[];
  content_health: {
    blogs_without_image: number;
    blogs_without_meta_description: number;
    pages_without_meta_description: number;
  };
}

export const dashboardApi = {
  get: () => getOne<DashboardData>(ADMIN_ENDPOINTS.DASHBOARD),
};
