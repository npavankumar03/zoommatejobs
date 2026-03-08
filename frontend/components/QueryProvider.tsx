"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { extractApiErrorMessage, type ApiError } from "@/lib/api";

function handleGlobalApiError(error: unknown) {
  const candidate = error as ApiError;
  const status = candidate?.response?.status;

  if (typeof window === "undefined") {
    return;
  }

  if (status === 401) {
    const current = `${window.location.pathname}${window.location.search}`;
    const next = encodeURIComponent(current || "/dashboard");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign(`/login?callbackUrl=${next}`);
    }
    return;
  }

  if (status === 403) {
    window.dispatchEvent(new CustomEvent("jobfill:access-denied"));
    return;
  }

  const detail = extractApiErrorMessage(error, "Request failed");
  window.dispatchEvent(
    new CustomEvent("jobfill:toast", {
      detail: {
        title: detail,
        type: "error",
      },
    })
  );
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: handleGlobalApiError,
        }),
        mutationCache: new MutationCache({
          onError: handleGlobalApiError,
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error: unknown) => {
              const status = (error as ApiError)?.response?.status;
              if (status === 401 || status === 403 || status === 429) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          }
        }
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
