import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CAMPAIGN_TEMPLATE_PRESETS,
  authenticationDestination,
  campaignFormForTemplate,
  campaignTemplateUrl,
  getCampaignTemplate,
} from "./campaign-templates";

const home = readFileSync(
  new URL("../pages/home.tsx", import.meta.url),
  "utf8",
);
const signin = readFileSync(
  new URL("../pages/signin.tsx", import.meta.url),
  "utf8",
);
const builder = readFileSync(
  new URL("../pages/studio/campaigns.tsx", import.meta.url),
  "utf8",
);

test("preset slugs are unique and form the complete allowlist", () => {
  const expected = [
    "product-launch",
    "seasonal-sale",
    "local-business-promotion",
    "social-media-growth",
    "new-customer-offer",
    "print-social-campaign",
    "ecommerce-product-campaign",
  ];
  const slugs = CAMPAIGN_TEMPLATE_PRESETS.map(({ slug }) => slug);
  assert.deepEqual(slugs, expected);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of expected)
    assert.equal(getCampaignTemplate(slug)?.slug, slug);
  for (const invalid of [
    "",
    "unknown",
    "../studio",
    "https://example.com",
    "/studio/billing",
  ])
    assert.equal(getCampaignTemplate(invalid), undefined);
});

test("every homepage template card is driven by the shared catalog and has both auth URLs", () => {
  assert.match(home, /CAMPAIGN_TEMPLATE_PRESETS\.map\(\(preset, index\)/);
  assert.match(home, /Use this template/);
  assert.match(home, /campaignTemplateUrl\(preset\.slug, !!token\)/);
  for (const preset of CAMPAIGN_TEMPLATE_PRESETS) {
    assert.equal(
      campaignTemplateUrl(preset.slug, true),
      `/studio/campaigns?template=${preset.slug}`,
    );
    assert.equal(
      campaignTemplateUrl(preset.slug, false),
      `/signin?campaignTemplate=${preset.slug}`,
    );
  }
});

test("authentication preserves only valid template intent for every completion path", () => {
  assert.equal(
    authenticationDestination("?campaignTemplate=seasonal-sale"),
    "/studio/campaigns?template=seasonal-sale",
  );
  assert.equal(
    authenticationDestination("?campaignTemplate=https%3A%2F%2Fevil.test"),
    "/studio",
  );
  assert.equal(
    authenticationDestination("?campaignTemplate=unknown&redirect=%2Fadmin"),
    "/studio",
  );
  assert.equal(
    authenticationDestination("?redirect=%2Fstudio%2Fbilling"),
    "/studio",
  );
  assert.equal((signin.match(/setLocation\(destination\)/g) ?? []).length, 3);
});

test("builder receives preset fields while customer-owned fields stay blank and editable", () => {
  for (const preset of CAMPAIGN_TEMPLATE_PRESETS) {
    const form = campaignFormForTemplate(preset);
    assert.deepEqual(form, {
      name: preset.title,
      productId: "",
      objective: preset.objective,
      campaignType: preset.campaignType,
      channel: preset.channel,
      promotion: "",
      instructions: preset.instructions,
      duration: preset.duration,
    });
    const edited = {
      ...form,
      objective: "My own objective",
      promotion: "SAVE20",
    };
    assert.equal(edited.objective, "My own objective");
    assert.equal(edited.promotion, "SAVE20");
  }
  assert.match(
    builder,
    /useState\(\(\) =>\s*campaignFormForTemplate\(selectedTemplate\)/,
  );
  assert.match(
    builder,
    /onChange=\{\(e\) => set\("objective", e\.target\.value\)\}/,
  );
});

test("loading a preset only prefills state; POST remains exclusively in form submission", () => {
  const beforeCreate = builder.slice(
    0,
    builder.indexOf("async function create"),
  );
  assert.doesNotMatch(beforeCreate, /method:\s*"POST"/);
  assert.match(builder, /<form onSubmit=\{create\}/);
  assert.match(builder, /fetch\("\/api\/campaigns", \{\s*method: "POST"/);
  assert.match(builder, /Create campaign brief/);
  assert.match(
    builder,
    /location\.assign\(`\/studio\/campaigns\/\$\{c\.id\}`\)/,
  );
});

test("no preset retains the existing campaign form defaults", () => {
  assert.deepEqual(campaignFormForTemplate(), {
    name: "",
    productId: "",
    objective: "",
    campaignType: "Launch",
    channel: "Instagram",
    promotion: "",
    instructions: "",
    duration: "30 seconds",
  });
});
