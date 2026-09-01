const unsafeCustomerText = (value: string) =>
  /^[\[{]/.test(value) ||
  /evidence[_ ]?ids?|model reasoning|chain of thought|hidden instructions?|parsing error|malformed output|as an ai|internal metadata/i.test(
    value,
  );

function confirmedText(value: unknown, fallback: string, limit: number) {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[<>]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)
    .trim();
  return cleaned && !unsafeCustomerText(cleaned) ? cleaned : fallback;
}

function firstConfirmedProduct(context: any) {
  const products = Array.isArray(context?.products) ? context.products : [];
  for (const product of products) {
    const name = confirmedText(product?.name, "", 160);
    if (name) return name;
  }
  return "the available products and services";
}

/**
 * Produces a conservative, customer-visible campaign from confirmed context.
 * It makes no provider call and intentionally avoids prices, performance claims,
 * guarantees, urgency, scarcity, or inferred business facts.
 */
export function deterministicCampaignFallback(context: unknown) {
  const source = context as any;
  const businessName = confirmedText(
    source?.identity?.name,
    "This business",
    120,
  );
  const product = firstConfirmedProduct(source);
  const audience = confirmedText(
    source?.audienceEvidence,
    "people reviewing the available options",
    180,
  );
  const callToAction = confirmedText(source?.ctaEvidence, "Learn more", 160);
  const title = `${businessName}: ${product}`.slice(0, 200).trim();
  const hook = `Explore ${product} from ${businessName}.`.slice(0, 300).trim();
  const script = `${businessName} offers ${product} for ${audience}. Explore the available details and decide whether this option fits your needs. When you are ready to continue, use the confirmed next step: ${callToAction}.`;
  const hookTexts = [
    hook,
    `Learn more about ${product}.`,
    `See what ${businessName} offers.`,
    `Looking for ${product}? Start here.`,
    `Explore options for ${audience}.`,
    `A straightforward look at ${product}.`,
    `Find out whether ${product} fits your needs.`,
    `Take a closer look at ${businessName}.`,
    `Review the details for ${product}.`,
    `Discover the next step from ${businessName}.`,
    `See the confirmed offer from ${businessName}.`,
    `Ready to learn more about ${product}?`,
  ].map((text) => ({
    text: text.slice(0, 300).trim(),
    rationale: "Uses only confirmed campaign information.",
    evidenceIds: [],
  }));
  const finalScript = {
    title,
    hook,
    script: script.slice(0, 8000),
    callToAction,
    claims: [],
    creativeRationale:
      "Uses only the confirmed business, product, audience, and next-step details.",
  };
  const strategy = {
    objective: `Introduce ${product}`.slice(0, 500),
    audience,
    positioning: `${businessName} offers ${product}.`.slice(0, 500),
    corePromise: `Clear information about ${product}.`.slice(0, 500),
    angle: `A straightforward introduction to ${product}.`.slice(0, 500),
    objections: ["Fit and next steps"],
    tone: "Clear and informative",
    channels: ["Digital"],
  };
  return {
    research: { audienceInsights: [audience], unknowns: [] },
    strategy,
    hooks: { hooks: hookTexts },
    winningScript: finalScript,
    finalScript,
    judge: null,
    ledger: [],
    factcheck: {
      pass: true,
      unsupportedClaims: [],
      conciseReasons: ["The draft uses only confirmed campaign information."],
    },
    qa: {
      pass: true,
      score: 100,
      issues: [],
      customerSummary: "Ready for your review.",
    },
  };
}
