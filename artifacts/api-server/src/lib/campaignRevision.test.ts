import assert from "node:assert/strict";
import test from "node:test";
import {
  scriptOutputSchema,
  strategyOutputSchema,
} from "../agents/schemas";
import { revisionSourceInput } from "./campaignRevision";

const context = {
  identity: { name: "Quae.ai" },
  products: [{ name: "AI marketing services" }],
  audienceEvidence: "small businesses",
  ctaEvidence: "Start building your campaign",
};

test("legacy public-safe campaign results remain revision sources", () => {
  const legacy = {
    strategy: {
      angle: "A direct introduction",
      audience: "small businesses",
      positioning: "One AI marketing department",
    },
    finalScript: {
      title: "Small business, big marketing goals",
      hook: "Small business, big marketing goals?",
      script:
        "Small business, big marketing goals? Quae.ai creates your campaigns, product visuals, social content, and video ads in one place. Start building your campaign today.",
      callToAction: "Start building your campaign today",
    },
  };

  assert.equal(strategyOutputSchema.safeParse(legacy.strategy).success, false);
  assert.equal(scriptOutputSchema.safeParse(legacy.finalScript).success, false);

  const compatible = revisionSourceInput(legacy, context);
  assert.ok(compatible);
  assert.equal(compatible.strategy.angle, legacy.strategy.angle);
  assert.equal(compatible.finalScript.script, legacy.finalScript.script);
  assert.equal(strategyOutputSchema.safeParse(compatible.strategy).success, true);
  assert.equal(
    scriptOutputSchema.safeParse(compatible.finalScript).success,
    true,
  );
});

test("invalid customer-visible results are not accepted for revision", () => {
  assert.equal(revisionSourceInput({ finalScript: null }, context), null);
});
