import type { Metadata } from "next";

import { ChatbotBuilder } from "../_components/builder/Builder";

export const metadata: Metadata = { title: "Chatbot builder" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatbotBuilder id={Number(id)} />;
}
