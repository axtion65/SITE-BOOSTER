export function isSessionCurrent(
  issuedAtMs: number,
  invalidBefore: Date | null | undefined,
): boolean {
  if (!Number.isFinite(issuedAtMs)) return false;
  return !invalidBefore || issuedAtMs >= invalidBefore.getTime();
}
