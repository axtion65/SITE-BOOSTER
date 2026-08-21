export type CustomerCopy = { title: string; hook: string; body: string; callToAction: string };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function customerCopy(result: unknown): CustomerCopy | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const final = (result as any).finalScript;
  if (!final || typeof final !== "object" || Array.isArray(final)) return null;
  const copy = { title: text(final.title), hook: text(final.hook), body: text(final.script), callToAction: text(final.callToAction) };
  return copy.title || copy.hook || copy.body || copy.callToAction ? copy : null;
}
