"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, FileText, LayoutDashboard, Sparkles, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchPublicSettings, useApiQuery } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/resume-tuner", label: "Resume Tuner", icon: Sparkles }
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: settings } = useApiQuery(["public-settings"], fetchPublicSettings, {
    staleTime: 30_000,
    refetchInterval: 60_000
  });
  const siteName = settings?.siteName ?? "zoommate";

  return (
    <aside className="w-full border-b border-slate-200 bg-white/90 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
          ZM
        </div>
        <div>
          <p className="text-sm font-semibold">{siteName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Candidate Portal</p>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
