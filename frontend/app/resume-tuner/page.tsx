import { redirect } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { ResumeTunerView } from "@/components/resume/ResumeTunerView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function ResumeTunerPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <AppTopbar title="Resume Tuner" subtitle="Compare your resume against a job description." />
        <ResumeTunerView />
      </main>
    </div>
  );
}
