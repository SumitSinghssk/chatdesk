import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import { apiErrorMessage, apiFieldErrors } from "./api/errors";

export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fallback?: string,
  fields?: string[]
) {
  const errors = apiFieldErrors(err);
  let matched = false;
  for (const [field, message] of Object.entries(errors)) {
    if (!fields || fields.includes(field)) {
      setError(field as Path<T>, { type: "server", message });
      matched = true;
    }
  }
  if (!matched) toast.error(apiErrorMessage(err, fallback));
}

export function emptyToNull<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])) as T;
}
