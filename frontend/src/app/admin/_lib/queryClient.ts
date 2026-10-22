import { QueryClient } from "@tanstack/react-query";

import { apiErrorStatus } from "@/app/admin/_lib/api/errors";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          const status = apiErrorStatus(error);
          return !!status && status >= 500 && count < 2;
        },
      },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}

export function clearQueryCache() {
  browserClient?.clear();
}
