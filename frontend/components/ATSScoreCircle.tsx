import { cn } from "@/lib/utils";

type ATSScoreCircleProps = {
  score: number;
  size?: number;
  className?: string;
};

export function ATSScoreCircle({ score, size = 140, className }: ATSScoreCircleProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const tone = clamped >= 75 ? "text-emerald-500" : clamped >= 45 ? "text-amber-500" : "text-rose-500";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth="10" className="fill-none stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth="10"
          strokeLinecap="round"
          className={cn("fill-none transition-all", tone)}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-bold">{clamped}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">ATS score</p>
      </div>
    </div>
  );
}
