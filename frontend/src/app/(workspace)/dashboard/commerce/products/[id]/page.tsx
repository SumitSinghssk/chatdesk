import type { Metadata } from "next";

import { EditProduct } from "../../_components/editor/EditProduct";

export const metadata: Metadata = { title: "Edit product" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditProduct id={Number(id)} />;
}
