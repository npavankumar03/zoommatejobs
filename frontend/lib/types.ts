export type Job = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  description?: string;
  requirements?: string | null;
  salary?: string | null;
  jobType: string;
  workMode: string;
  sourceUrl: string;
  atsType?: string;
  isActive?: boolean;
  isSponsorsH1B?: boolean;
  postedAt?: string | null;
  createdAt?: string;
  score?: number;
  matchedKeywords?: string[];
};

export type Application = {
  id: string;
  jobId: string;
  userId?: string;
  status: "SAVED" | "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED";
  appliedAt?: string | null;
  notes?: string | null;
  aiFilledData?: unknown;
  createdAt?: string;
  updatedAt?: string;
  job?: {
    id: string;
    title: string;
    company: string;
    location?: string | null;
    workMode?: string;
    jobType?: string;
    isActive?: boolean;
  };
};
