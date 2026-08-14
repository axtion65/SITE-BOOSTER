export function formatScore(score: unknown): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return Number(score.toFixed(1)).toString();
}
