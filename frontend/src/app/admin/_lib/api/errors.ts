import axios from "axios";

export interface ApiErrorPayload {
  status?: false;
  message?: string;
  errors?: Record<string, string[]>;
  code?: string;
  detail?: string;
}

export function apiErrorData(err: unknown): ApiErrorPayload {
  if (axios.isAxiosError(err)) return (err.response?.data as ApiErrorPayload) ?? {};
  return {};
}

export function apiErrorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

export function apiErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const data = apiErrorData(err);
  if (data.message) return data.message;
  if (data.detail) return data.detail;
  if (axios.isAxiosError(err) && !err.response) return "Can't reach the server. Check your connection.";
  return fallback;
}

export function apiFieldErrors(err: unknown): Record<string, string> {
  const errors = apiErrorData(err).errors ?? {};
  return Object.fromEntries(
    Object.entries(errors)
      .filter(([, msgs]) => Array.isArray(msgs) && msgs.length > 0)
      .map(([field, msgs]) => [field, msgs[0]!])
  );
}

export function isCancelled(err: unknown): boolean {
  return axios.isCancel(err);
}
