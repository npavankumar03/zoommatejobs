"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { fetchPublicSettings, useApiQuery } from "@/lib/api";

const DEFAULT_TITLE = "zoommate";

export function AppRuntimeBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const { data: publicSettings } = useApiQuery(
    ["public-settings"],
    fetchPublicSettings,
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: 1,
    }
  );

  useEffect(() => {
    const title = publicSettings?.siteName || DEFAULT_TITLE;
    document.title = title;
  }, [publicSettings?.siteName, pathname]);

  useEffect(() => {
    if (!publicSettings?.maintenanceMode) return;
    if (session?.user?.isAdmin) return;
    if (pathname === "/maintenance") return;
    if (pathname.startsWith("/api")) return;
    router.replace("/maintenance");
  }, [pathname, publicSettings?.maintenanceMode, router, session?.user?.isAdmin]);

  useEffect(() => {
    const token = session?.backendToken;
    if (!token || typeof window === "undefined") return;

    window.postMessage(
      {
        source: "jobfill-web",
        type: "JOBFILL_AUTH_TOKEN",
        payload: {
          token,
          userId: session?.user?.id ?? "",
          userEmail: session?.user?.email ?? "",
          userName: session?.user?.name ?? "",
          userAvatar: session?.user?.image ?? "",
        },
      },
      "*"
    );
  }, [session?.backendToken, session?.user?.email, session?.user?.id, session?.user?.image, session?.user?.name]);

  return null;
}
