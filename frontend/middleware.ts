import { NextResponse } from "next/server";

import { auth } from "@/auth";

const AUTH_REQUIRED_ROUTES = [
  "/dashboard",
  "/jobs",
  "/profile",
  "/applications",
  "/resume-tuner"
];

function isExactOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

type PublicSettings = {
  maintenanceMode?: boolean;
};

async function loadPublicSettings(origin: string): Promise<PublicSettings | null> {
  try {
    const response = await fetch(`${origin}/api/public/settings`, {
      cache: "no-store"
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicSettings;
  } catch {
    return null;
  }
}

export default auth(async (request) => {
  const { pathname, search } = request.nextUrl;
  const isAuthenticated = Boolean(
    request.auth?.user?.id ||
      (request.auth as { userId?: string; sub?: string } | null)?.userId ||
      (request.auth as { sub?: string } | null)?.sub
  );
  const isAdmin = Boolean(
    request.auth?.user?.isAdmin ||
      (request.auth as { isAdmin?: boolean } | null)?.isAdmin
  );

  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/api/auth")) {
    // Continue through maintenance guard below.
  } else if (pathname.startsWith("/api/public/settings")) {
    return NextResponse.next();
  }

  const isPublicAsset =
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/fonts/");

  if (isPublicAsset) {
    return NextResponse.next();
  }

  const settings = await loadPublicSettings(request.nextUrl.origin);
  const maintenanceMode = Boolean(settings?.maintenanceMode);
  if (maintenanceMode && !isAdmin && !pathname.startsWith("/api/auth")) {
    if (pathname !== "/maintenance") {
      return NextResponse.redirect(new URL("/maintenance", request.nextUrl));
    }
    return NextResponse.next();
  }

  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/api/auth") || pathname === "/maintenance") {
    if (pathname === "/maintenance" && !maintenanceMode) {
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }
    return NextResponse.next();
  }

  const requiresAuth = AUTH_REQUIRED_ROUTES.some((route) =>
    isExactOrChild(pathname, route)
  );
  const requiresAdmin = isExactOrChild(pathname, "/admin");

  if (requiresAdmin) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.nextUrl);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }

    if (!isAdmin) {
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }

    return NextResponse.next();
  }

  if (requiresAuth && !isAuthenticated) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
