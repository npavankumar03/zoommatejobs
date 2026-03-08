import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminDashboardView } from "@/components/admin/pages/AdminDashboardView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function AdminDashboardPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  return (
    <AdminShell title="Admin Dashboard" subtitle="Platform health and system metrics.">
      <AdminDashboardView />
    </AdminShell>
  );
}
