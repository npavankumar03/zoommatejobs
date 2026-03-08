import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminUsersView } from "@/components/admin/pages/AdminUsersView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function AdminUsersPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  return (
    <AdminShell title="Users" subtitle="Search, review, and manage user accounts.">
      <AdminUsersView />
    </AdminShell>
  );
}
