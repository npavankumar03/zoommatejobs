import { cn } from "@/lib/utils";

type ProgressProps = {
  value?: number;
  className?: string;
};

export function Progress({ value = 0, className }: ProgressProps) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800", className)}>
      <div className="h-full bg-slate-900 transition-all dark:bg-slate-100" style={{ width: `${safe}%` }} />
    </div>
  );
}
