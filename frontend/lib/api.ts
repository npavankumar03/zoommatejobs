"use client";

import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { getSession } from "next-auth/react";

type ApiErrorPayload = {
  detail?: string;
  message?: string;
};

export type ApiError = AxiosError<ApiErrorPayload>;

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api",
});

function dispatchAccessDenied() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("jobfill:access-denied"));
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const path = `${window.location.pathname}${window.location.search}`;
  const next = encodeURIComponent(path || "/dashboard");
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign(`/login?callbackUrl=${next}`);
  }
}

export function extractApiErrorMessage(error: unknown, fallback = "Request failed"): string {
  const candidate = error as ApiError | undefined;
  return (
    candidate?.response?.data?.detail ||
    candidate?.response?.data?.message ||
    candidate?.message ||
    fallback
  );
}

api.interceptors.request.use(async (config) => {
  const session = await getSession();
  const token = session?.backendToken;

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: ApiError) => {
    const status = error.response?.status;
    if (status === 401) {
      redirectToLogin();
    } else if (status === 403) {
      dispatchAccessDenied();
    }
    return Promise.reject(error);
  }
);

export async function apiRequest<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<T>(config);
  return response.data;
}

type QueryFactoryOptions<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData, readonly unknown[]>,
  "queryKey" | "queryFn"
>;

export function useApiQuery<TData>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<TData>,
  options?: QueryFactoryOptions<TData>
) {
  return useQuery<TData, ApiError, TData, readonly unknown[]>({
    queryKey,
    queryFn,
    ...options,
  });
}

type MutationFactoryOptions<TData, TVariables> = UseMutationOptions<
  TData,
  ApiError,
  TVariables
>;

export function useApiMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationFactoryOptions<TData, TVariables>
) {
  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    ...options,
  });
}

export type PublicSettings = {
  siteName: string;
  siteTagline: string;
  maintenanceMode: boolean;
  allowRegistration: boolean;
  activeAiProvider?: "OPENAI" | "GEMINI";
  activeAiProviderName?: string;
  maxFreeAiFillsPerDay?: number;
};

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const response = await fetch("/api/public/settings", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load public settings");
  }
  return (await response.json()) as PublicSettings;
}
