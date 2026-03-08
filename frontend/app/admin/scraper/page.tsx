import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminScraperView } from "@/components/admin/pages/AdminScraperView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function AdminScraperPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  return (
    <AdminShell title="Scraper" subtitle="Manage scheduler, runs, and logs.">
      <AdminScraperView />
    </AdminShell>
  );
}
