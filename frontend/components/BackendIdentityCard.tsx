"use client";

import { useEffect, useState } from "react";

import apiClient from "@/lib/api-client";

type BackendIdentity = {
  userId: string;
  email: string | null;
  isAdmin: boolean;
};

export function BackendIdentityCard() {
  const [data, setData] = useState<BackendIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadIdentity = async () => {
      try {
        const response = await apiClient.get<BackendIdentity>("/me");
        if (isMounted) setData(response.data);
      } catch {
        if (isMounted) setError("Failed to verify backend JWT identity.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Verifying backend identity...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <h2 className="mb-2 text-base font-semibold text-slate-900">Backend JWT Identity</h2>
      <p>User ID: {data?.userId}</p>
      <p>Email: {data?.email ?? "N/A"}</p>
      <p>Admin: {data?.isAdmin ? "Yes" : "No"}</p>
    </div>
  );
}
