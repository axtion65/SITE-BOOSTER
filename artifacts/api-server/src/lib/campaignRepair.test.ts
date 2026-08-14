import assert from "node:assert/strict";
import test from "node:test";
import {
  qualityCycleReady,
  runBoundedQualityCycle,
} from "../agents/qualityCycle";

const ledger = [
  {
    factId: "fact_001",
    category: "product.price",
    value: "$10.00",
    source: "product.price",
  },
];
const strategy = {
  objective: "Sell shirts",
  audience: "Customers",
  positioning: "Custom shirts",
  corePromise: "A custom shirt",
  angle: "Simple customization",
  objections: [],
  tone: "Friendly",
  channels: ["social"],
};
const script = (priceLine: string) => ({
  title: "Big Al's custom T-shirts",
  hook: "Make your next shirt your own",
  script: `${priceLine} ${"Choose a custom T-shirt made for your message. ".repeat(3)}`,
  callToAction: "Order your custom T-shirt",
  claims: [{ claim: priceLine, evidenceIds: ["fact_001"] }],
  creativeRationale: "Uses the supported product and exact price clearly.",
});
const qa = {
  pass: true,
  score: 82,
  issues: [] as string[],
  customerSummary: "The content meets the quality standard.",
};

test("unsupported exact-price modifier is supplied to one repair and rechecked", async () => {
  let factChecks = 0;
  let qaChecks = 0;
  let repairs = 0;
  const result = await runBoundedQualityCycle({
    finalScript: script("Starting at $10"),
    ledger,
    strategy,
    judge: { winner: "Candidate 1", winningScore: 82 },
    checkFacts: async (current) => {
      factChecks++;
      const unsupported = current.script.includes("Starting at");
      return {
        pass: !unsupported,
        unsupportedClaims: unsupported
          ? [
              "The evidence supports an exact $10.00 price, not a starting price.",
            ]
          : [],
        conciseReasons: unsupported ? ["Unsupported price modifier"] : [],
      };
    },
    checkQa: async (_current, facts) => {
      qaChecks++;
      return facts.pass
        ? qa
        : {
            ...qa,
            pass: false,
            issues: ["Remove the unsupported starting-price language."],
          };
    },
    repair: async (input) => {
      repairs++;
      assert.equal(input.winner.script.includes("Starting at $10"), true);
      assert.equal(input.ledger[0].value, "$10.00");
      assert.match(input.factcheckFailures?.join(" ") || "", /starting price/i);
      assert.match(input.qaIssues?.join(" ") || "", /starting-price/i);
      assert.deepEqual(input.deterministicFailures, []);
      return script("Big Al's custom T-shirts are $10.");
    },
  });

  assert.equal(repairs, 1);
  assert.equal(factChecks, 2);
  assert.equal(qaChecks, 2);
  assert.equal(result.finalScript.script.includes("Starting at"), false);
  assert.equal(result.factcheck.pass, true);
  assert.equal(result.qa.pass, true);
  assert.deepEqual(result.finalInvalid, []);
  assert.equal(qualityCycleReady(result, 75), true);
});

test("one failed repair remains a quality failure without another retry", async () => {
  let repairs = 0;
  const result = await runBoundedQualityCycle({
    finalScript: script("Starting at $10"),
    ledger,
    strategy,
    judge: {},
    checkFacts: async () => ({
      pass: false,
      unsupportedClaims: ["Unsupported price modifier"],
      conciseReasons: ["Exact price only"],
    }),
    checkQa: async () => ({
      ...qa,
      pass: false,
      issues: ["Unsupported claim remains"],
    }),
    repair: async () => {
      repairs++;
      return script("Starting at $10");
    },
  });

  assert.equal(repairs, 1);
  assert.equal(result.factcheck.pass, false);
  assert.equal(result.qa.pass, false);
  assert.equal(qualityCycleReady(result, 75), false);
});
