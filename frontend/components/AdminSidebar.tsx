"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, BriefcaseBusiness, LayoutDashboard, ScrollText, Settings, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchPublicSettings, useApiQuery } from "@/lib/api";

const ADMIN_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/ai-settings", label: "AI Settings", icon: Bot },
  { href: "/admin/scraper", label: "Scraper", icon: ScrollText },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: settings } = useApiQuery(["public-settings"], fetchPublicSettings, {
    staleTime: 30_000,
    refetchInterval: 60_000
  });
  const siteName = settings?.siteName ?? "zoommate";

  return (
    <aside className="w-full border-b border-slate-200 bg-white/90 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 md:sticky md:top-0 md:h-screen md:w-72 md:border-b-0 md:border-r">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">AD</div>
        <div>
          <p className="text-sm font-semibold">{siteName} Admin</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Control Center</p>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
        {ADMIN_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-600 text-white"
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
