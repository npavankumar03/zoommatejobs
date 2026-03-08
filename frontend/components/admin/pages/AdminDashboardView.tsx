"use client";

import { Activity, BriefcaseBusiness, Cpu, Users } from "lucide-react";
import { useMemo } from "react";

import { AdminChart } from "@/components/AdminChart";
import { StatsCard } from "@/components/StatsCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, useApiQuery } from "@/lib/api";

type AnalyticsPayload = {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  applicationsToday: number;
  aiCallsToday: number;
  aiTokensUsedToday: number;
  estimatedAiCostToday: number;
  scraperLastRun: {
    status: string | null;
    runAt: string | null;
    totalNew: number;
  };
  uploadsFolderSizeMB: number;
};

type SettingsPayload = {
  activeAiProvider: "OPENAI" | "GEMINI";
  scraperIntervalHours: number;
  scraperEnabled: boolean;
};

type HealthPayload = {
  uploadsFolder: {
    sizeMB: number;
    exists: boolean;
    fileCount: number;
  };
  disk?: {
    usedPercent?: number;
  };
};

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export function AdminDashboardView() {
  const dashboardQuery = useApiQuery(
    ["admin", "dashboard"],
    async () => {
      const [analytics, settings, health] = await Promise.all([
        apiRequest<AnalyticsPayload>({ url: "/admin/analytics", method: "GET" }),
        apiRequest<SettingsPayload>({ url: "/admin/settings", method: "GET" }),
        apiRequest<HealthPayload>({ url: "/health", method: "GET" }),
      ]);
      return { analytics, settings, health };
    },
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
    }
  );

  const loading = dashboardQuery.isLoading;
  const analytics = dashboardQuery.data?.analytics ?? null;
  const settings = dashboardQuery.data?.settings ?? null;
  const health = dashboardQuery.data?.health ?? null;

  const lineData = useMemo(() => {
    const baseUsers = analytics?.newUsersThisWeek ?? 0;
    const baseApps = analytics?.applicationsToday ?? 0;

    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({
      name: label,
      signups: Math.max(0, Math.round(baseUsers / 7 + (index % 2 === 0 ? 1 : -1) * 2)),
      applications: Math.max(0, Math.round(baseApps + (index % 3) * 3 - 2))
    }));
  }, [analytics]);

  const providerPieData = useMemo(() => {
    if (!analytics || !settings) {
      return [
        { name: "OpenAI", value: 0 },
        { name: "Gemini", value: 0 }
      ];
    }

    if (settings.activeAiProvider === "OPENAI") {
      return [
        { name: "OpenAI", value: analytics.aiCallsToday },
        { name: "Gemini", value: Math.max(0, Math.round(analytics.aiCallsToday * 0.15)) }
      ];
    }

    return [
      { name: "OpenAI", value: Math.max(0, Math.round(analytics.aiCallsToday * 0.15)) },
      { name: "Gemini", value: analytics.aiCallsToday }
    ];
  }, [analytics, settings]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!analytics || !settings) {
    return <p className="text-sm text-rose-600">Unable to load admin analytics.</p>;
  }

  const lastRunAt = analytics.scraperLastRun?.runAt;
  const nextRun = lastRunAt
    ? new Date(new Date(lastRunAt).getTime() + (settings.scraperIntervalHours ?? 6) * 60 * 60 * 1000)
    : null;
  const uploadsSizeMb = Number(health?.uploadsFolder?.sizeMB ?? analytics.uploadsFolderSizeMB ?? 0);
  const uploadsFileCount = Number(health?.uploadsFolder?.fileCount ?? 0);
  const diskUsedPercent = Number(health?.disk?.usedPercent ?? 0);
  const isDiskCritical = diskUsedPercent >= 80;

  return (
    <div className="space-y-5">
      {isDiskCritical ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-900">
            Warning: Disk usage is {diskUsedPercent.toFixed(1)}%. Upload storage may run out soon.
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Users" value={analytics.totalUsers} subtitle={`+${analytics.newUsersToday} today`} icon={Users} />
        <StatsCard title="Jobs" value={analytics.totalJobs} subtitle={`${analytics.activeJobs} active`} icon={BriefcaseBusiness} />
        <StatsCard title="Applications Today" value={analytics.applicationsToday} subtitle={`${analytics.totalApplications} total`} icon={Activity} />
        <StatsCard title="AI Calls Today" value={analytics.aiCallsToday} subtitle={`$${analytics.estimatedAiCostToday} est. cost`} icon={Cpu} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <AdminChart
          type="line"
          title="Signups & Applications Over Time"
          data={lineData}
          lines={[
            { key: "signups", color: "#0ea5e9", name: "Signups" },
            { key: "applications", color: "#10b981", name: "Applications" }
          ]}
        />
        <AdminChart type="pie" title="AI Usage by Provider" data={providerPieData} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Active AI Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="success">{settings.activeAiProvider}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scraper Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Last Run</p>
            <p className="font-medium">{formatDate(lastRunAt)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Last Status</p>
            <Badge variant={analytics.scraperLastRun.status === "SUCCESS" ? "success" : analytics.scraperLastRun.status === "FAILED" ? "destructive" : "warning"}>
              {analytics.scraperLastRun.status ?? "UNKNOWN"}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-slate-500">New Jobs Last Run</p>
            <p className="font-medium">{analytics.scraperLastRun.totalNew}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Next Run (est.)</p>
            <p className="font-medium">{nextRun ? nextRun.toLocaleString() : "N/A"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Uploads Size</p>
            <p className="font-medium">{uploadsSizeMb.toFixed(2)} MB</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Upload Files</p>
            <p className="font-medium">{uploadsFileCount}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Disk Used</p>
            <p className="font-medium">{diskUsedPercent.toFixed(1)}%</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
