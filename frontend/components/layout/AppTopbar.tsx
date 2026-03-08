import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchPublicSettings, useApiQuery } from "@/lib/api";

type AppTopbarProps = {
  title: string;
  subtitle?: string;
};

export function AppTopbar({ title, subtitle }: AppTopbarProps) {
  const { data: settings } = useApiQuery(["public-settings"], fetchPublicSettings, {
    staleTime: 30_000,
    refetchInterval: 60_000
  });

  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {settings?.siteName ?? "zoommate"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
