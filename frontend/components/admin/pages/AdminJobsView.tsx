"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ToastProvider";
import apiClient from "@/lib/api-client";

type JobRow = {
  id: string;
  title: string;
  company: string;
  jobType: string;
  workMode: string;
  isActive: boolean;
  isSponsorsH1B: boolean;
  createdAt: string;
};

const INITIAL_FORM = {
  title: "",
  company: "",
  location: "",
  description: "",
  requirements: "",
  salary: "",
  jobType: "FULL_TIME",
  workMode: "ONSITE",
  sourceUrl: "",
  atsType: "OTHER",
  isActive: true,
  isSponsorsH1B: false
};

export function AdminJobsView() {
  const { pushToast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{ jobs: JobRow[] }>("/admin/jobs?limit=300&page=1");
      setJobs(response.data.jobs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return jobs;
    return jobs.filter(
      (job) => job.title.toLowerCase().includes(q) || job.company.toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const toggleActive = async (job: JobRow) => {
    try {
      await apiClient.put(`/admin/jobs/${job.id}`, { isActive: !job.isActive });
      pushToast("Job status updated", "success");
      await loadJobs();
    } catch {
      pushToast("Failed to update job", "error");
    }
  };

  const deleteJob = async (id: string) => {
    if (!window.confirm("Delete this job?")) return;

    try {
      await apiClient.delete(`/admin/jobs/${id}`);
      pushToast("Job deleted", "success");
      await loadJobs();
    } catch {
      pushToast("Failed to delete job", "error");
    }
  };

  const addJob = async () => {
    if (!form.title || !form.company || !form.description || !form.sourceUrl) {
      pushToast("Title, company, description, and source URL are required.", "error");
      return;
    }

    try {
      await apiClient.post("/admin/jobs", form);
      pushToast("Job added", "success");
      setShowModal(false);
      setForm(INITIAL_FORM);
      await loadJobs();
    } catch {
      pushToast("Failed to add job", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Filter by title/company" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-sm" />
        <Button onClick={() => setShowModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Job Manually
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800">
              <th className="px-3 py-3">Title</th>
              <th className="px-3 py-3">Company</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Active</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(loading ? [] : filtered).map((job) => (
              <tr key={job.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-3 py-3">{job.title}</td>
                <td className="px-3 py-3">{job.company}</td>
                <td className="px-3 py-3">{job.jobType}</td>
                <td className="px-3 py-3">
                  <Switch checked={job.isActive} onCheckedChange={() => void toggleActive(job)} />
                </td>
                <td className="px-3 py-3">
                  <Button variant="destructive" size="sm" onClick={() => void deleteJob(job.id)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className="p-3 text-sm text-slate-500">Loading jobs...</p> : null}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal} title="Add Job Manually" className="max-w-3xl">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={form.company} onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))} />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
          </div>
          <div>
            <Label>Salary</Label>
            <Input value={form.salary} onChange={(event) => setForm((prev) => ({ ...prev, salary: event.target.value }))} />
          </div>
          <div>
            <Label>Job Type</Label>
            <Input value={form.jobType} onChange={(event) => setForm((prev) => ({ ...prev, jobType: event.target.value }))} />
          </div>
          <div>
            <Label>Work Mode</Label>
            <Input value={form.workMode} onChange={(event) => setForm((prev) => ({ ...prev, workMode: event.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Source URL</Label>
            <Input value={form.sourceUrl} onChange={(event) => setForm((prev) => ({ ...prev, sourceUrl: event.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Requirements</Label>
            <Textarea value={form.requirements} onChange={(event) => setForm((prev) => ({ ...prev, requirements: event.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.isActive} onCheckedChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))} />
            <p className="text-sm">Active</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.isSponsorsH1B} onCheckedChange={(value) => setForm((prev) => ({ ...prev, isSponsorsH1B: value }))} />
            <p className="text-sm">H1B Friendly</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button onClick={() => void addJob()}>Add Job</Button>
        </div>
      </Dialog>
    </div>
  );
}
