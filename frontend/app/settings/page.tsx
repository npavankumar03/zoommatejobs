import { redirect } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth-helpers";

export default async function SettingsPage() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <AppTopbar title="Settings" subtitle="Account-level preferences." />
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 dark:text-slate-300">Signed in as {session.user.email}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
