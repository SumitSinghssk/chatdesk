import type { Metadata } from "next";

import { ProductEditor } from "../../_components/editor/ProductEditor";

export const metadata: Metadata = { title: "New product" };

export default function Page() {
  return <ProductEditor product={null} />;
}
