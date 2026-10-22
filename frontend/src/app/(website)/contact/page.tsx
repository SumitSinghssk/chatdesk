import type { Metadata } from "next";

import ContactPage from "./_components/ContactPage";
import { buildMetadata } from "@/app/(website)/_lib/seo";

import { WEBSITE_ROUTES } from "@/config/routes";
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata(WEBSITE_ROUTES.CONTACT(), {
    title: "Contact us",
    description: "Get in touch with our team.",
  });
}

export default function Page() {
  return <ContactPage />;
}
