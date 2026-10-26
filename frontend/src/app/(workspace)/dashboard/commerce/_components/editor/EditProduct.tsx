"use client";

import { useQuery } from "@tanstack/react-query";

import { ErrorBanner, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import { COMMERCE_QK, commerceApi } from "../../../_lib/commerceApi";
import { ProductEditor } from "./ProductEditor";

/** /dashboard/commerce/products/<id> */
export function EditProduct({ id }: { id: number }) {
  const { data, error, isLoading } = useQuery({
    queryKey: COMMERCE_QK.PRODUCT(id),
    queryFn: async () => (await commerceApi.product(id)).data,
  });
  if (isLoading) return <Spinner className="h-full" />;
  if (error || !data) return <ErrorBanner message={errorMessage(error ?? new Error("Product not found"))} />;
  return <ProductEditor key={data.updated_at} product={data} />;
}
