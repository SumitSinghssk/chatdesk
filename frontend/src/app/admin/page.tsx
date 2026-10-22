import { redirect } from "next/navigation";

import { ADMIN_ROUTES } from "@/config/routes";
export default function AdminIndex() {
  redirect(ADMIN_ROUTES.DASHBOARD());
}
