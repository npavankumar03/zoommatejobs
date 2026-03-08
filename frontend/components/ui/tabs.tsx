"use client";

import { cn } from "@/lib/utils";

type TabsListProps = {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
};

export function TabsList({ tabs, active, onChange, className }: TabsListProps) {
  return (
    <div className={cn("flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active === tab.id
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
              : "text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-800/60"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
