import { redirect } from "next/navigation";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <DashboardView />;
}
