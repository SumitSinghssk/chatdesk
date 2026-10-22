import type { Metadata } from "next";

import { EditTemplate } from "../../_components/editor/EditorPages";

export const metadata: Metadata = { title: "Edit template" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditTemplate id={Number(id)} />;
}
