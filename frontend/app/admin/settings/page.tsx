import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSiteSettingsView } from "@/components/admin/pages/AdminSiteSettingsView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function AdminSettingsPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  return (
    <AdminShell title="Global Settings" subtitle="Site branding and access controls.">
      <AdminSiteSettingsView />
    </AdminShell>
  );
}
