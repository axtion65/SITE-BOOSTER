import { evidenceRecordSchema, type Evidence } from "./schemas";
const PATHS = [
  "business.name",
  "business.description",
  "business.industry",
  "business.targetAudience",
  "business.goal",
  "business.offerings",
  "business.tagline",
  "business.cta",
  "brand.voice",
  "brand.personality",
  "brand.likedPhrases",
  "brand.avoidedPhrases",
  "brand.notes",
  "brand.cta",
  "product.name",
  "product.description",
  "product.category",
  "product.features",
  "product.benefits",
  "product.targetAudience",
  "product.customerProblem",
  "product.price",
  "product.salePrice",
  "product.offer",
  "product.cta",
] as const;
const WEBSITE_PATHS = [
  "identity.name",
  "identity.description",
  "audienceEvidence",
  "offerEvidence",
  "ctaEvidence",
] as const;
const WEBSITE_PRODUCT_FIELDS = [
  "name",
  "description",
  "category",
  "features",
  "benefits",
  "targetAudience",
  "customerProblem",
  "price",
  "salePrice",
  "offer",
  "cta",
] as const;
function at(root: any, path: string) {
  return path.split(".").reduce((v, k) => v?.[k], root);
}
export function buildEvidenceLedger(context: unknown): Evidence[] {
  let n = 0;
  const facts: Evidence[] = [];
  const websiteProductPaths = Array.isArray((context as any)?.products)
    ? (context as any).products.flatMap((_: unknown, index: number) =>
        WEBSITE_PRODUCT_FIELDS.map((field) => `products.${index}.${field}`),
      )
    : [];
  for (const path of [...PATHS, ...WEBSITE_PATHS, ...websiteProductPaths]) {
    const raw = at(context, path);
    const values = Array.isArray(raw)
      ? raw
      : raw == null || raw === ""
        ? []
        : [raw];
    values.forEach((value, index) =>
      facts.push(
        evidenceRecordSchema.parse({
          factId: `fact_${String(++n).padStart(3, "0")}`,
          category: path.split(".")[0],
          value: String(value),
          source: Array.isArray(raw) ? `${path}[${index}]` : path,
        }),
      ),
    );
  }
  return facts;
}
export function validateEvidenceLedger(context: unknown, ledger: Evidence[]) {
  return ledger.every((f) => {
    const match = f.source.match(/^(.*?)(?:\[(\d+)\])?$/)!;
    const raw = at(context, match[1]);
    const value = match[2] === undefined ? raw : raw?.[Number(match[2])];
    return value != null && String(value) === f.value;
  });
}
