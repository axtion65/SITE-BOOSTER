import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FREE_AD_PACK_FORMATS,
  buildFreeAdPackCopy,
  coverImageRect,
  freeAdPackFilename,
  type FreeAdPackDraft,
} from "./free-ad-pack";
import {
  authenticationDestination,
  freeAdPackUrl,
  isFreeAdPackIntent,
  protectedSignInUrl,
} from "./campaign-templates";

const page = readFileSync(
  new URL("../pages/studio/free-ad-pack.tsx", import.meta.url),
  "utf8",
);
const home = readFileSync(
  new URL("../pages/home.tsx", import.meta.url),
  "utf8",
);
const signin = readFileSync(
  new URL("../pages/signin.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const layout = readFileSync(
  new URL("../pages/studio/layout.tsx", import.meta.url),
  "utf8",
);

const draft: FreeAdPackDraft = {
  businessName: "  Ten   Tees ",
  productName: " Custom Shirts ",
  offer: " Shirts from $15 ",
  benefit: " Printed locally! ",
  callToAction: " Order today ",
  website: "https://tentees.site/",
  accentColor: "#7c3aed",
};

test("free ad pack has the three promised social formats", () => {
  assert.deepEqual(
    FREE_AD_PACK_FORMATS.map(({ id, width, height }) => ({
      id,
      width,
      height,
    })),
    [
      { id: "square", width: 1080, height: 1080 },
      { id: "story", width: 1080, height: 1920 },
      { id: "landscape", width: 1200, height: 628 },
    ],
  );
  assert.equal(new Set(FREE_AD_PACK_FORMATS.map(({ id }) => id)).size, 3);
});

test("free ad pack copy uses only customer-provided business facts", () => {
  assert.deepEqual(buildFreeAdPackCopy(draft), {
    businessName: "Ten Tees",
    headline: "Shirts from $15",
    productName: "Custom Shirts",
    benefit: "Printed locally!",
    callToAction: "Order today",
    website: "tentees.site",
    caption:
      "Shirts from $15 from Ten Tees. Printed locally. Order today at tentees.site.",
  });
  assert.equal(
    freeAdPackFilename(draft, FREE_AD_PACK_FORMATS[0]),
    "custom-shirts-square-1080x1080.png",
  );
});

test("image cover calculation fills the canvas without stretching", () => {
  assert.deepEqual(coverImageRect(800, 600, 1080, 1080), {
    x: -180,
    y: 0,
    width: 1440,
    height: 1080,
  });
  assert.deepEqual(coverImageRect(0, 600, 1080, 1080), {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
});

test("free ad pack intent survives signup and direct protected navigation", () => {
  assert.equal(freeAdPackUrl(false), "/signin?freeAdPack=1");
  assert.equal(freeAdPackUrl(true), "/studio/free-ad-pack");
  assert.equal(isFreeAdPackIntent("?freeAdPack=1"), true);
  assert.equal(isFreeAdPackIntent("?freeAdPack=true"), false);
  assert.equal(
    authenticationDestination("?freeAdPack=1&redirect=https%3A%2F%2Fevil.test"),
    "/studio/free-ad-pack",
  );
  assert.equal(
    protectedSignInUrl("/studio/free-ad-pack", "?redirect=%2Fadmin"),
    "/signin?freeAdPack=1",
  );
  assert.match(
    signin,
    /defaultValue=\{freeAdPackIntent \? "signup" : "signin"\}/,
  );
});

test("homepage and workspace expose one connected free ad pack flow", () => {
  assert.match(home, /const freeAdPackRoute = freeAdPackUrl\(!!token\)/);
  assert.match(home, /Create My Free Ad Pack/);
  assert.match(home, /Free account required\. No credit card\./);
  assert.match(app, /path="\/studio\/free-ad-pack"/);
  assert.match(layout, /href="\/studio\/free-ad-pack" label="Free Ad Pack"/);
  assert.match(page, /FREE_AD_PACK_FORMATS\.map/);
  assert.match(page, /canvas\.toBlob/);
  assert.match(page, /Build My Full Campaign/);
});

test("free ad pack production stays local and cannot spend provider credits", () => {
  assert.match(page, /This tool runs in your browser and uses zero credits/);
  assert.doesNotMatch(
    page,
    /fetch\(|marketingApi|\/api\/|fal|replicate|creditsMutation/,
  );
});
