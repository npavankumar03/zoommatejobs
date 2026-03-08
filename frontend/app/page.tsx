import Link from "next/link";
import { Bot, BriefcaseBusiness, Filter, Sparkles, WandSparkles } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth-helpers";

type PublicSettings = {
  siteName: string;
  siteTagline: string;
};

async function getPublicSettings(): Promise<PublicSettings> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

  try {
    const response = await fetch(`${base}/admin/settings/public`, {
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Failed to fetch settings");

    const data = (await response.json()) as Partial<PublicSettings>;
    return {
      siteName: data.siteName ?? "zoommate",
      siteTagline: data.siteTagline ?? "Your AI-powered job application copilot"
    };
  } catch {
    return {
      siteName: "zoommate",
      siteTagline: "Your AI-powered job application copilot"
    };
  }
}

export default async function LandingPage() {
  const session = await getServerSession();
  const settings = await getPublicSettings();

  const loggedIn = Boolean(session?.user?.id);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50 text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
              ZM
            </div>
            <div>
              <p className="text-sm font-semibold">{settings.siteName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{settings.siteTagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {loggedIn ? (
              <Button asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/login">Sign in with Google</Link>
              </Button>
            )}
          </div>
        </nav>

        <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <Sparkles className="h-3.5 w-3.5" />
            AI-assisted job applications
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Apply to thousands of jobs with one AI click</h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300">
            Fill forms faster, tune your resume for ATS, track applications in one place, and prioritize H1B-friendly roles.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={loggedIn ? "/dashboard" : "/login"}>{loggedIn ? "Go to Dashboard" : "Get Started"}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/jobs">Explore Jobs</Link>
            </Button>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: WandSparkles, title: "AI Autofill", desc: "Map profile data to form fields with confidence scoring." },
            { icon: Bot, title: "Resume Tuning", desc: "Improve resume alignment with ATS keyword suggestions." },
            { icon: BriefcaseBusiness, title: "Job Tracking", desc: "Kanban-style application pipeline from saved to offer." },
            { icon: Filter, title: "H1B Filter", desc: "Focus on roles with sponsorship-friendly signals." }
          ].map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{feature.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { step: "1", title: "Connect profile", desc: "Sign in with Google and upload your resume once." },
              { step: "2", title: "Match jobs", desc: "Get role recommendations ranked by your experience." },
              { step: "3", title: "Apply faster", desc: "Open job pages and let AI autofill form fields." }
            ].map((item) => (
              <Card key={item.step}>
                <CardHeader>
                  <CardTitle className="text-base">
                    <span className="mr-2 rounded-full bg-slate-900 px-2 py-1 text-xs text-white dark:bg-slate-100 dark:text-slate-900">{item.step}</span>
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-slate-200 py-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          © {new Date().getFullYear()} {settings.siteName}. Built for faster, smarter job applications.
        </footer>
      </div>
    </main>
  );
}
