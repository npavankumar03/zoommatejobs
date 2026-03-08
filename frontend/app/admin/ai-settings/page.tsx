import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminAiSettingsView } from "@/components/admin/pages/AdminAiSettingsView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function AdminAiSettingsPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  return (
    <AdminShell title="AI Settings" subtitle="Configure providers, models, and limits.">
      <AdminAiSettingsView />
    </AdminShell>
  );
}
