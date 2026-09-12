import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ImagePlus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Field,
  MarketingPage,
  PremiumCard,
  fieldClass,
} from "./marketing-shared";
import {
  EMPTY_FREE_AD_PACK_DRAFT,
  FREE_AD_PACK_FORMATS,
  buildFreeAdPackCopy,
  coverImageRect,
  freeAdPackFilename,
  type FreeAdPackDraft,
  type FreeAdPackFormat,
} from "@/lib/free-ad-pack";

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function wrappedLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const usedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && context.measureText(`${last}…`).width > maxWidth) {
      last = last.split(" ").slice(0, -1).join(" ");
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const lines = wrappedLines(context, text, maxWidth, maxLines);
  lines.forEach((line, index) =>
    context.fillText(line, x, y + index * lineHeight),
  );
  return y + lines.length * lineHeight;
}

function drawAd(
  canvas: HTMLCanvasElement,
  sourceImage: HTMLImageElement | null,
  draft: FreeAdPackDraft,
  format: FreeAdPackFormat,
) {
  canvas.width = format.width;
  canvas.height = format.height;
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = format;
  const copy = buildFreeAdPackCopy(draft);
  const scale = width / 1080;
  const padding = Math.round(width * 0.065);
  const maxTextWidth =
    format.id === "landscape" ? width * 0.62 : width - padding * 2;

  context.fillStyle = "#091322";
  context.fillRect(0, 0, width, height);

  if (sourceImage) {
    const rect = coverImageRect(
      sourceImage.naturalWidth,
      sourceImage.naturalHeight,
      width,
      height,
    );
    context.save();
    context.filter = "contrast(1.04) saturate(1.07)";
    context.drawImage(sourceImage, rect.x, rect.y, rect.width, rect.height);
    context.restore();
  } else {
    const glow = context.createRadialGradient(
      width * 0.7,
      height * 0.25,
      0,
      width * 0.7,
      height * 0.25,
      width * 0.7,
    );
    glow.addColorStop(0, `${draft.accentColor}88`);
    glow.addColorStop(1, "#091322");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }

  const topShade = context.createLinearGradient(0, 0, 0, height * 0.4);
  topShade.addColorStop(0, "rgba(4, 10, 22, .78)");
  topShade.addColorStop(1, "rgba(4, 10, 22, 0)");
  context.fillStyle = topShade;
  context.fillRect(0, 0, width, height * 0.45);

  const lowerStart = format.id === "landscape" ? height * 0.18 : height * 0.38;
  const lowerShade = context.createLinearGradient(0, lowerStart, 0, height);
  lowerShade.addColorStop(0, "rgba(4, 10, 22, 0)");
  lowerShade.addColorStop(0.38, "rgba(4, 10, 22, .7)");
  lowerShade.addColorStop(1, "rgba(4, 10, 22, .98)");
  context.fillStyle = lowerShade;
  context.fillRect(0, lowerStart, width, height - lowerStart);

  context.textBaseline = "top";
  context.fillStyle = "#ffffff";
  context.font = `800 ${Math.round(27 * scale)}px Inter, Arial, sans-serif`;
  context.fillText(copy.businessName.toUpperCase(), padding, padding);

  context.fillStyle = draft.accentColor;
  roundedRect(
    context,
    padding,
    padding + Math.round(48 * scale),
    Math.round(96 * scale),
    Math.round(8 * scale),
    Math.round(4 * scale),
  );
  context.fill();

  const contentTop =
    format.id === "story"
      ? height * 0.6
      : format.id === "landscape"
        ? height * 0.34
        : height * 0.52;
  context.fillStyle = draft.accentColor;
  context.font = `800 ${Math.round((format.id === "landscape" ? 25 : 30) * scale)}px Inter, Arial, sans-serif`;
  context.fillText(copy.productName.toUpperCase(), padding, contentTop);

  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.round((format.id === "landscape" ? 54 : 72) * scale)}px Inter, Arial, sans-serif`;
  let nextY = drawWrappedText(
    context,
    copy.headline,
    padding,
    contentTop + Math.round(48 * scale),
    maxTextWidth,
    Math.round((format.id === "landscape" ? 60 : 80) * scale),
    2,
  );

  if (copy.benefit) {
    context.fillStyle = "rgba(255,255,255,.86)";
    context.font = `500 ${Math.round((format.id === "landscape" ? 25 : 31) * scale)}px Inter, Arial, sans-serif`;
    nextY = drawWrappedText(
      context,
      copy.benefit,
      padding,
      nextY + Math.round(18 * scale),
      maxTextWidth,
      Math.round(40 * scale),
      format.id === "landscape" ? 1 : 2,
    );
  }

  const buttonHeight = Math.round(68 * scale);
  const buttonY = Math.min(
    height - padding - buttonHeight,
    nextY + Math.round(30 * scale),
  );
  context.font = `800 ${Math.round(27 * scale)}px Inter, Arial, sans-serif`;
  const buttonWidth = Math.min(
    maxTextWidth,
    context.measureText(copy.callToAction).width + Math.round(60 * scale),
  );
  context.fillStyle = draft.accentColor;
  roundedRect(
    context,
    padding,
    buttonY,
    buttonWidth,
    buttonHeight,
    buttonHeight / 2,
  );
  context.fill();
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(
    copy.callToAction,
    padding + Math.round(30 * scale),
    buttonY + buttonHeight / 2,
  );

  if (copy.website) {
    context.textBaseline = "alphabetic";
    context.textAlign = "right";
    context.font = `700 ${Math.round(23 * scale)}px Inter, Arial, sans-serif`;
    context.fillStyle = "rgba(255,255,255,.82)";
    context.fillText(copy.website, width - padding, height - padding);
    context.textAlign = "left";
  }
}

export default function FreeAdPackPage() {
  const { toast } = useToast();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<FreeAdPackDraft>(EMPTY_FREE_AD_PACK_DRAFT);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<FreeAdPackFormat>(
    FREE_AD_PACK_FORMATS[0],
  );
  const copy = useMemo(() => buildFreeAdPackCopy(draft), [draft]);
  const canDownload = Boolean(sourceImage && draft.productName.trim());

  useEffect(() => {
    if (previewRef.current)
      drawAd(previewRef.current, sourceImage, draft, selectedFormat);
  }, [sourceImage, draft, selectedFormat]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const set = (key: keyof FreeAdPackDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function chooseImage(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast({
        title: "Choose a PNG, JPG, or WebP image",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "That image is larger than 10 MB",
        description:
          "Choose a smaller copy so your browser can build the pack quickly.",
        variant: "destructive",
      });
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    const image = new window.Image();
    image.onload = () => {
      setSourceImage(image);
      setImageName(file.name);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      objectUrlRef.current = null;
      toast({ title: "We couldn’t open that image", variant: "destructive" });
    };
    image.src = objectUrl;
  }

  function download(format: FreeAdPackFormat) {
    if (!sourceImage || !draft.productName.trim()) return;
    const canvas = document.createElement("canvas");
    drawAd(canvas, sourceImage, draft, format);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast({
          title: "We couldn’t prepare that download",
          variant: "destructive",
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = freeAdPackFilename(draft, format);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: `${format.label} downloaded` });
    }, "image/png");
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(copy.caption);
      toast({ title: "Caption copied" });
    } catch {
      toast({
        title: "Copy is blocked in this browser",
        description: "Select the caption below and copy it manually.",
        variant: "destructive",
      });
    }
  }

  return (
    <MarketingPage
      eyebrow="Free tools"
      title="Free Ad Starter Pack"
      description="Turn one product photo into three polished social-ad sizes and ready-to-post copy. This tool runs in your browser and uses zero credits."
    >
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-100">
        <ShieldCheck className="h-5 w-5 text-emerald-300" />
        <b>Free account benefit:</b> your image stays on this device, and no
        video or AI-generation credits are used.
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <PremiumCard elevated>
          <p className="quae-eyebrow">1 · Add your details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <input
                className={fieldClass}
                value={draft.businessName}
                onChange={(event) => set("businessName", event.target.value)}
                placeholder="Your business"
                maxLength={70}
              />
            </Field>
            <Field label="Product or service">
              <input
                className={fieldClass}
                value={draft.productName}
                onChange={(event) => set("productName", event.target.value)}
                placeholder="What are you promoting?"
                maxLength={80}
                required
              />
            </Field>
            <Field label="Offer">
              <input
                className={fieldClass}
                value={draft.offer}
                onChange={(event) => set("offer", event.target.value)}
                placeholder="20% off this week"
                maxLength={80}
              />
            </Field>
            <Field label="Main benefit">
              <input
                className={fieldClass}
                value={draft.benefit}
                onChange={(event) => set("benefit", event.target.value)}
                placeholder="Why customers should care"
                maxLength={120}
              />
            </Field>
            <Field label="Button text">
              <input
                className={fieldClass}
                value={draft.callToAction}
                onChange={(event) => set("callToAction", event.target.value)}
                placeholder="Shop now"
                maxLength={30}
              />
            </Field>
            <Field label="Website or contact">
              <input
                className={fieldClass}
                value={draft.website}
                onChange={(event) => set("website", event.target.value)}
                placeholder="yourbusiness.com"
                maxLength={80}
              />
            </Field>
          </div>

          <p className="quae-eyebrow mt-8">2 · Add your photo</p>
          <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-violet-300/30 bg-violet-400/[.06] p-5 hover:bg-violet-400/10">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200">
              <ImagePlus className="h-6 w-6" />
            </span>
            <span>
              <b className="block text-white">
                {imageName || "Choose a product photo"}
              </b>
              <span className="mt-1 block text-xs text-slate-400">
                PNG, JPG, or WebP · maximum 10 MB
              </span>
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => chooseImage(event.target.files?.[0])}
            />
          </label>

          <div className="mt-6 flex items-center gap-3">
            <label
              htmlFor="ad-accent"
              className="text-sm font-semibold text-slate-200"
            >
              Brand color
            </label>
            <input
              id="ad-accent"
              aria-label="Brand color"
              type="color"
              value={draft.accentColor}
              onChange={(event) => set("accentColor", event.target.value)}
              className="h-11 w-16 cursor-pointer rounded-lg border border-white/15 bg-transparent p-1"
            />
            <span className="text-xs uppercase text-slate-400">
              {draft.accentColor}
            </span>
          </div>
        </PremiumCard>

        <div className="space-y-6">
          <PremiumCard>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="quae-eyebrow">3 · Preview and download</p>
                <h2 className="text-xl font-extrabold">
                  Your ad updates as you type
                </h2>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> 0 credits
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {FREE_AD_PACK_FORMATS.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  aria-pressed={selectedFormat.id === format.id}
                  onClick={() => setSelectedFormat(format)}
                  className={`rounded-xl border px-3 py-3 text-left text-xs transition-colors ${selectedFormat.id === format.id ? "border-violet-400 bg-violet-500/15 text-white" : "border-white/10 text-slate-400 hover:border-violet-300/30"}`}
                >
                  <b className="block text-current">{format.label}</b>
                  <span className="mt-1 block">
                    {format.width} × {format.height}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex max-h-[660px] min-h-[360px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#07101d] p-3">
              <canvas
                ref={previewRef}
                aria-label={`${selectedFormat.label} ad preview`}
                className="max-h-[630px] max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>

            {!canDownload && (
              <p className="mt-4 text-center text-sm text-amber-200">
                Add a product name and photo to unlock your downloads.
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {FREE_AD_PACK_FORMATS.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  disabled={!canDownload}
                  onClick={() => download(format)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  {format.label}
                </button>
              ))}
            </div>
          </PremiumCard>

          <PremiumCard>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="quae-eyebrow">Ready-to-post caption</p>
                <h2 className="text-lg font-bold">
                  Copy, post, or build the full campaign
                </h2>
              </div>
              <Sparkles className="h-6 w-6 shrink-0 text-violet-300" />
            </div>
            <textarea
              aria-label="Ready-to-post caption"
              readOnly
              value={copy.caption}
              className={`${fieldClass} mt-4 min-h-28 resize-none leading-6`}
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={copyCaption}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-bold text-white hover:bg-white/[.06]"
              >
                <Copy className="h-4 w-4" /> Copy caption
              </button>
              <Link
                href="/studio/campaigns?template=product-launch"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-500"
              >
                Build My Full Campaign <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </PremiumCard>
        </div>
      </div>
    </MarketingPage>
  );
}
