import { redirect } from "next/navigation";

import { ApplicationKanban } from "@/components/ApplicationKanban";
import { Sidebar } from "@/components/Sidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { getServerSession } from "@/lib/auth-helpers";

export default async function ApplicationsPage() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <AppTopbar title="Applications" subtitle="Drag cards between columns to update status." />
        <ApplicationKanban />
      </main>
    </div>
  );
}
