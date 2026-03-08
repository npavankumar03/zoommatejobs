"use client";

import { BriefcaseBusiness, FileCheck2, ShieldCheck, Star, Target } from "lucide-react";
import { useMemo } from "react";

import { MatchScoreBadge } from "@/components/MatchScoreBadge";
import { Sidebar } from "@/components/Sidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { type Application, type Job } from "@/lib/types";
import { apiRequest, useApiQuery } from "@/lib/api";

type Stats = {
  totalApplications: number;
  interviews: number;
  offers: number;
  saved: number;
};

export function DashboardView() {
  const dashboardQuery = useApiQuery(
    ["dashboard"],
    async () => {
      const [statsResponse, applicationsResponse, matchedResponse, usageResponse] =
        await Promise.all([
          apiRequest<{ counts: Record<string, number> }>({
            url: "/applications/stats",
            method: "GET",
          }),
          apiRequest<{ applications: Application[] }>({
            url: "/applications?limit=6&page=1",
            method: "GET",
          }),
          apiRequest<{ jobs: Job[] }>({
            url: "/jobs/matched",
            method: "GET",
          }),
          apiRequest<{ count: number; limit: number }>({
            url: "/ai/usage",
            method: "GET",
          }),
        ]);

      return {
        statsCounts: statsResponse.counts,
        applications: applicationsResponse.applications ?? [],
        matchedJobs: (matchedResponse.jobs ?? []).slice(0, 5),
        usageCount: Number(usageResponse.count ?? 0),
        usageLimit: Number(usageResponse.limit ?? 10),
      };
    },
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
    }
  );

  const loading = dashboardQuery.isLoading;
  const payload = dashboardQuery.data;
  const stats: Stats = {
    totalApplications: payload?.applications.length ?? 0,
    interviews: payload?.statsCounts.INTERVIEW ?? 0,
    offers: payload?.statsCounts.OFFER ?? 0,
    saved: payload?.statsCounts.SAVED ?? 0,
  };
  const matchedJobs = payload?.matchedJobs ?? [];
  const recentApplications = payload?.applications.slice(0, 6) ?? [];
  const usageCount = payload?.usageCount ?? 0;
  const usageLimit = payload?.usageLimit ?? 10;

  const usagePercent = useMemo(() => {
    if (!usageLimit) return 0;
    return Math.min(100, Math.round((usageCount / usageLimit) * 100));
  }, [usageCount, usageLimit]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="md:flex">
        <Sidebar />

        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <AppTopbar title="Dashboard" subtitle="Your job search command center" />

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-500">Total Applications</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-2xl font-bold">{stats.totalApplications}</p>
                    <BriefcaseBusiness className="h-5 w-5 text-slate-400" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-500">Interviews</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-2xl font-bold">{stats.interviews}</p>
                    <Target className="h-5 w-5 text-slate-400" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-500">Offers</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-2xl font-bold">{stats.offers}</p>
                    <Star className="h-5 w-5 text-slate-400" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-500">Saved Jobs</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-2xl font-bold">{stats.saved}</p>
                    <ShieldCheck className="h-5 w-5 text-slate-400" />
                  </CardContent>
                </Card>
              </section>

              <section className="mt-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      AI Usage
                      <span className="text-sm font-normal text-slate-500">
                        {usageCount} / {usageLimit} AI fills used today
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Progress value={usagePercent} />
                  </CardContent>
                </Card>
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Matched Jobs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {matchedJobs.length ? (
                      matchedJobs.map((job) => (
                        <div key={job.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{job.title}</p>
                              <p className="text-sm text-slate-500">{job.company}</p>
                            </div>
                            <MatchScoreBadge score={job.score ?? 0} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No matched jobs yet.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Applications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentApplications.length ? (
                      recentApplications.map((application) => (
                        <div key={application.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{application.job?.title ?? "Job"}</p>
                              <p className="text-sm text-slate-500">{application.job?.company ?? "Unknown"}</p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {application.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No applications yet.</p>
                    )}
                  </CardContent>
                </Card>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
