/**
 * Split approved copy only at sentence punctuation followed by whitespace.
 * Dots inside brands, domains, decimals, and similar tokens are not boundaries.
 */
export function splitApprovedSentences(value: string): string[] {
  return value
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
