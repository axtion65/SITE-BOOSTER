import { CampaignError } from "./errors";
import {
  evidenceRecordSchema,
  researchInputSchema,
  type Evidence,
} from "./schemas";
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
const MAX_EVIDENCE_RECORDS = 100;
const MAX_EVIDENCE_VALUE_LENGTH = 5000;
const MAX_CUSTOMER_INSTRUCTION_LENGTH = 5000;

const boundedText = (value: unknown, limit: number) =>
  String(value).slice(0, limit);

export function buildEvidenceLedger(context: unknown): Evidence[] {
  let n = 0;
  const facts: Evidence[] = [];
  const websiteProductPaths = Array.isArray((context as any)?.products)
    ? (context as any).products.flatMap((_: unknown, index: number) =>
        WEBSITE_PRODUCT_FIELDS.map((field) => `products.${index}.${field}`),
      )
    : [];
  for (const path of [...PATHS, ...WEBSITE_PATHS, ...websiteProductPaths]) {
    if (facts.length >= MAX_EVIDENCE_RECORDS) break;
    const raw = at(context, path);
    const values = Array.isArray(raw)
      ? raw
      : raw == null || raw === ""
        ? []
        : [raw];
    for (
      let index = 0;
      index < values.length && facts.length < MAX_EVIDENCE_RECORDS;
      index++
    ) {
      facts.push(
        evidenceRecordSchema.parse({
          factId: `fact_${String(++n).padStart(3, "0")}`,
          category: path.split(".")[0],
          value: boundedText(values[index], MAX_EVIDENCE_VALUE_LENGTH),
          source: Array.isArray(raw) ? `${path}[${index}]` : path,
        }),
      );
    }
  }
  return facts;
}

export function validateEvidenceLedger(context: unknown, ledger: Evidence[]) {
  return (
    ledger.length > 0 &&
    ledger.length <= MAX_EVIDENCE_RECORDS &&
    ledger.every((fact) => {
      const match = fact.source.match(/^(.*?)(?:\[(\d+)\])?$/)!;
      const raw = at(context, match[1]);
      const value =
        match[2] === undefined ? raw : raw?.[Number(match[2])];
      return (
        value != null &&
        boundedText(value, MAX_EVIDENCE_VALUE_LENGTH) === fact.value
      );
    })
  );
}

export function buildResearchInput(
  context: unknown,
  ledger = buildEvidenceLedger(context),
) {
  const customerInstruction = JSON.stringify(
    (context as any)?.campaignBrief ?? {},
  ).slice(0, MAX_CUSTOMER_INSTRUCTION_LENGTH);
  const parsed = researchInputSchema.safeParse({
    ledger,
    customerInstruction,
  });
  if (!parsed.success) {
    throw new CampaignError("INVALID_RESEARCH_INPUT", "permanent");
  }
  return parsed.data;
}
