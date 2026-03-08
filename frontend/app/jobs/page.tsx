import { redirect } from "next/navigation";

import { JobsView } from "@/components/jobs/JobsView";
import { getServerSession } from "@/lib/auth-helpers";

export default async function JobsPage() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <JobsView />;
}
