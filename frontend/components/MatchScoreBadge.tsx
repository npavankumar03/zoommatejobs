import { Badge } from "@/components/ui/badge";

type MatchScoreBadgeProps = {
  score?: number | null;
};

export function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  const safeScore = Math.max(0, Math.min(100, score ?? 0));

  if (safeScore >= 75) return <Badge variant="success">{safeScore}% match</Badge>;
  if (safeScore >= 45) return <Badge variant="warning">{safeScore}% match</Badge>;
  return <Badge variant="outline">{safeScore}% match</Badge>;
}
