"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { JobCard } from "@/components/JobCard";
import { JobDetailPanel } from "@/components/JobDetailPanel";
import { Sidebar } from "@/components/Sidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import apiClient from "@/lib/api-client";
import { type Job } from "@/lib/types";

export function JobsView() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filters, setFilters] = useState({
    title: "",
    location: "",
    workMode: "",
    jobType: "",
    salaryMin: "",
    salaryMax: "",
    h1bOnly: false
  });

  const [matchedLookup, setMatchedLookup] = useState<Record<string, number>>({});

  const loadMatchedScores = async () => {
    const matched = await apiClient.get<{ jobs: Job[] }>("/jobs/matched");
    const map: Record<string, number> = {};
    matched.data.jobs.forEach((job) => {
      map[job.id] = job.score ?? 0;
    });
    setMatchedLookup(map);
  };

  const loadJobs = async () => {
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.title) params.set("title", filters.title);
    if (filters.location) params.set("location", filters.location);
    if (filters.workMode) params.set("workMode", filters.workMode);
    if (filters.jobType) params.set("jobType", filters.jobType);
    if (filters.salaryMin) params.set("salaryMin", filters.salaryMin);
    if (filters.salaryMax) params.set("salaryMax", filters.salaryMax);
    if (filters.h1bOnly) params.set("isSponsorsH1B", "true");
    params.set("page", "1");
    params.set("limit", "40");

    try {
      const response = await apiClient.get<{ jobs: Job[] }>(`/jobs?${params.toString()}`);
      const enriched = response.data.jobs.map((job) => ({ ...job, score: matchedLookup[job.id] ?? 0 }));
      setJobs(enriched);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadMatchedScores().catch(() => {
        setMatchedLookup({});
      });
      await loadJobs();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedLookup]);

  const filteredCount = useMemo(() => jobs.length, [jobs]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <AppTopbar title="Jobs" subtitle="Search and apply with AI autofill." />

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="search"
                  placeholder="Title"
                  className="pl-9"
                  value={filters.title}
                  onChange={(event) => setFilters((prev) => ({ ...prev, title: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={filters.location} onChange={(event) => setFilters((prev) => ({ ...prev, location: event.target.value }))} />
            </div>
            <div>
              <Label htmlFor="workMode">Work Mode</Label>
              <Select id="workMode" value={filters.workMode} onChange={(event) => setFilters((prev) => ({ ...prev, workMode: event.target.value }))}>
                <option value="">Any</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">Onsite</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="jobType">Job Type</Label>
              <Select id="jobType" value={filters.jobType} onChange={(event) => setFilters((prev) => ({ ...prev, jobType: event.target.value }))}>
                <option value="">Any</option>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERNSHIP">Internship</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="salaryMin">Min Salary</Label>
              <Input id="salaryMin" type="number" value={filters.salaryMin} onChange={(event) => setFilters((prev) => ({ ...prev, salaryMin: event.target.value }))} />
            </div>
            <div>
              <Label htmlFor="salaryMax">Max Salary</Label>
              <Input id="salaryMax" type="number" value={filters.salaryMax} onChange={(event) => setFilters((prev) => ({ ...prev, salaryMax: event.target.value }))} />
            </div>
            <div className="flex items-end gap-2">
              <div className="pb-2">
                <Switch checked={filters.h1bOnly} onCheckedChange={(value) => setFilters((prev) => ({ ...prev, h1bOnly: value }))} />
              </div>
              <p className="text-sm">H1B only</p>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  void loadJobs();
                }}
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-500">{filteredCount} jobs found</p>

        {loading ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full" />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onSelect={setSelectedJob} />
            ))}
          </div>
        )}
      </main>

      <JobDetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
