import type { z } from "@workspace/api-zod";
import { judgeOutputSchema } from "./schemas";
export type JudgeRaw = z.infer<typeof judgeOutputSchema>;
export const RUBRIC = {
  hook: 20,
  audienceRelevance: 15,
  persuasion: 15,
  specificity: 10,
  emotionalPull: 10,
  credibility: 10,
  originality: 10,
  brandFit: 5,
  cta: 5,
} as const;
export function scoreCandidates(raw: JudgeRaw) {
  const scored = raw.candidates.map((c) => ({
    ...c,
    total: Object.keys(RUBRIC).reduce(
      (sum, k) => sum + c.scores[k as keyof typeof RUBRIC],
      0,
    ),
  }));
  const ordered = [...scored].sort((a, b) => b.total - a.total);
  return {
    candidates: scored,
    winner: ordered[0].label,
    winningScore: ordered[0].total,
    confidence: raw.confidence,
    needsTieBreak: ordered[0].total - ordered[1].total <= 2,
  };
}
