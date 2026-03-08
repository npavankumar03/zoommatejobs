import { BriefcaseBusiness, CalendarDays, MapPin } from "lucide-react";

import { MatchScoreBadge } from "@/components/MatchScoreBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Job } from "@/lib/types";

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

type JobCardProps = {
  job: Job;
  onSelect: (job: Job) => void;
};

export function JobCard({ job, onSelect }: JobCardProps) {
  return (
    <button type="button" className="text-left" onClick={() => onSelect(job)}>
      <Card className="h-full transition-transform hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base leading-tight">{job.title}</CardTitle>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{job.company}</p>
            </div>
            <MatchScoreBadge score={job.score ?? 0} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <p className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.location || "Location not specified"}
            </p>
            <p className="flex items-center gap-1">
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              {job.jobType.replace("_", " ")}
            </p>
            <p className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Posted {formatDate(job.postedAt ?? job.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{job.workMode}</Badge>
            {job.isSponsorsH1B ? <Badge variant="success">H1B Friendly</Badge> : null}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
