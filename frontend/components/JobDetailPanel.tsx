"use client";

import { ExternalLink, Sparkles, X } from "lucide-react";

import { MatchScoreBadge } from "@/components/MatchScoreBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Job } from "@/lib/types";

type JobDetailPanelProps = {
  job: Job | null;
  onClose: () => void;
};

export function JobDetailPanel({ job, onClose }: JobDetailPanelProps) {
  if (!job) return null;

  const description = job.description || "No description available for this job.";
  const requirements = job.requirements || "No explicit requirements were provided.";

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{job.title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{job.company}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <MatchScoreBadge score={job.score ?? 0} />
        <Badge variant="secondary">{job.workMode}</Badge>
        <Badge variant="outline">{job.jobType}</Badge>
        {job.isSponsorsH1B ? <Badge variant="success">H1B sponsorship signal</Badge> : null}
      </div>

      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Description</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{description}</p>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Requirements</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{requirements}</p>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Company Info</h3>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            {job.company} • {job.location || "Location not listed"}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Match Breakdown</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {(job.matchedKeywords || []).slice(0, 12).map((keyword) => (
              <Badge key={keyword} variant="outline">
                {keyword}
              </Badge>
            ))}
            {!job.matchedKeywords?.length ? <p className="text-sm text-slate-500">No breakdown available.</p> : null}
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary">Save Job</Button>
        <Button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.open(job.sourceUrl, "_blank", "noopener,noreferrer");
              window.dispatchEvent(
                new CustomEvent("jobfill-ai-apply", {
                  detail: { jobId: job.id, sourceUrl: job.sourceUrl }
                })
              );
            }
          }}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Apply — AI will autofill
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.open(job.sourceUrl, "_blank", "noopener,noreferrer");
            }
          }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open Source
        </Button>
      </div>
    </div>
  );
}
