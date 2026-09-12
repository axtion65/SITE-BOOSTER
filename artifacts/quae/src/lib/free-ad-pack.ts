export type FreeAdPackFormat = {
  id: "square" | "story" | "landscape";
  label: string;
  channel: string;
  width: number;
  height: number;
};

export type FreeAdPackDraft = {
  businessName: string;
  productName: string;
  offer: string;
  benefit: string;
  callToAction: string;
  website: string;
  accentColor: string;
};

export const FREE_AD_PACK_FORMATS = [
  {
    id: "square",
    label: "Square post",
    channel: "Instagram + Facebook",
    width: 1080,
    height: 1080,
  },
  {
    id: "story",
    label: "Story",
    channel: "Stories + TikTok",
    width: 1080,
    height: 1920,
  },
  {
    id: "landscape",
    label: "Landscape ad",
    channel: "Facebook + LinkedIn",
    width: 1200,
    height: 628,
  },
] as const satisfies readonly FreeAdPackFormat[];

export const EMPTY_FREE_AD_PACK_DRAFT: FreeAdPackDraft = {
  businessName: "",
  productName: "",
  offer: "",
  benefit: "",
  callToAction: "Shop now",
  website: "",
  accentColor: "#7c3aed",
};

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function buildFreeAdPackCopy(draft: FreeAdPackDraft) {
  const businessName = clean(draft.businessName);
  const productName = clean(draft.productName) || "Something worth sharing";
  const offer = clean(draft.offer);
  const benefit = clean(draft.benefit);
  const callToAction = clean(draft.callToAction) || "Learn more";
  const website = clean(draft.website)
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  const headline = offer || productName;
  const caption = [
    offer
      ? `${offer} from ${businessName || productName}.`
      : `Meet ${productName}${businessName ? ` from ${businessName}` : ""}.`,
    benefit
      ? `${benefit.replace(/[.!?]+$/, "")}.`
      : "Made for customers who want a better choice.",
    `${callToAction}${website ? ` at ${website}` : ""}.`,
  ].join(" ");

  return {
    businessName: businessName || "YOUR BUSINESS",
    headline,
    productName,
    benefit,
    callToAction,
    website,
    caption,
  };
}

export function freeAdPackFilename(
  draft: FreeAdPackDraft,
  format: FreeAdPackFormat,
) {
  const stem =
    clean(draft.productName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "quae-ad";
  return `${stem}-${format.id}-${format.width}x${format.height}.png`;
}

export function coverImageRect(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  };
}
