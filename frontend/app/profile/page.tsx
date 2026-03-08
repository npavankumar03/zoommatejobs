import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/ProfileForm";
import { Sidebar } from "@/components/Sidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { getServerSession } from "@/lib/auth-helpers";

export default async function ProfilePage() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <AppTopbar title="Profile" subtitle="Manage your career data and resume." />
        <ProfileForm />
      </main>
    </div>
  );
}
