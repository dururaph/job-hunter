export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 70 ? "text-good border-good/40" : score >= 40 ? "text-warn border-warn/40" : "text-muted border-line";
  return (
    <span
      title="Keyword match against your resume"
      className={`inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-md border font-mono text-sm font-semibold ${tone}`}
    >
      {score}
    </span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "bad" }) {
  const cls =
    tone === "good" ? "border-good/30 text-good" : tone === "bad" ? "border-bad/30 text-bad" : "border-line text-muted";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

export function timeAgo(date: Date | null): string {
  if (!date) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
