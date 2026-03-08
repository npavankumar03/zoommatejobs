"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { ATSScoreCircle } from "@/components/ATSScoreCircle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import apiClient from "@/lib/api-client";

type TuneResult = {
  atsScore: number;
  missingKeywords: string[];
  presentKeywords: string[];
  improvedBullets: string[];
  summarySuggestion: string;
  overallFeedback: string;
};

export function ResumeTunerView() {
  const [resumeText, setResumeText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TuneResult | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiClient.get<{ user: { resumeText?: string | null } }>("/profile");
        setResumeText(response.data.user.resumeText ?? "");
      } catch {
        setResumeText("");
      }
    })();
  }, []);

  const analyze = async () => {
    if (!jobDescription.trim() || !jobTitle.trim()) {
      setError("Job title and description are required.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await apiClient.post<TuneResult>("/ai/tune-resume", {
        jobDescription,
        jobTitle,
        companyName: companyName || null
      });
      setResult(response.data);
    } catch (analyzeError: unknown) {
      const detail =
        typeof analyzeError === "object" &&
        analyzeError !== null &&
        "response" in analyzeError &&
        typeof (analyzeError as { response?: { data?: { detail?: string } } }).response?.data?.detail === "string"
          ? (analyzeError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Failed to run analysis.";
      setError(detail ?? "Failed to run analysis.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={resumeText}
              onChange={(event) => setResumeText(event.target.value)}
              className="min-h-[360px]"
              placeholder="Resume text will auto-load from your profile, or paste your resume here..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Job title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
            <Input placeholder="Company name (optional)" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            <Textarea
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              className="min-h-[260px]"
              placeholder="Paste full job description"
            />
            <Button onClick={analyze} disabled={loading}>
              <Sparkles className="mr-2 h-4 w-4" />
              {loading ? "Analyzing..." : "Analyze"}
            </Button>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </CardContent>
        </Card>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-6">
              <ATSScoreCircle score={result.atsScore} />

              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-sm font-medium text-rose-600">Missing keywords</p>
                  <div className="flex flex-wrap gap-2">
                    {result.missingKeywords?.map((word) => (
                      <Badge key={word} variant="destructive">
                        {word}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-emerald-600">Present keywords</p>
                  <div className="flex flex-wrap gap-2">
                    {result.presentKeywords?.map((word) => (
                      <Badge key={word} variant="success">
                        {word}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold">Improved bullet points</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
                  {result.improvedBullets?.map((bullet, index) => (
                    <li key={`${index}-${bullet.slice(0, 12)}`}>{bullet}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Suggested summary</h4>
                <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{result.summarySuggestion}</p>
                <h4 className="mb-2 mt-4 text-sm font-semibold">Overall feedback</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300">{result.overallFeedback}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
