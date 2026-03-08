import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminJobsView } from "@/components/admin/pages/AdminJobsView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function AdminJobsPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  return (
    <AdminShell title="Jobs" subtitle="Maintain job inventory and manual additions.">
      <AdminJobsView />
    </AdminShell>
  );
}
