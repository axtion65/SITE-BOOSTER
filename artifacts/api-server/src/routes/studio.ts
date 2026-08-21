import { Router } from "express";
import { ExpandPromptBody } from "@workspace/api-zod";
import OpenAI from "openai";
import { resolveUserIdFromToken } from "./auth";
import { durationPlanInstruction, normalizeScriptTiming, parseRequestedDuration, validateScript, type AdScript } from "../lib/scriptEngine";
import { sanitizeVisualPrompt } from "../lib/falvideo";
import { RENDERING_MODELS } from "@workspace/plans";

const router = Router();

// Initialise OpenAI client lazily so the server starts even without the key
// (routes that call the API will fail at request time, not at boot).
function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

// Rendering models come from the shared authoritative catalogue.

// Template-specific system prompts — each type has its own structural DNA
const TEMPLATE_SYSTEM_PROMPTS: Record<string, string> = {
  "tiktok-viral-hook": `You are a TikTok growth expert who has written hooks that generated 100M+ views. You specialize in PATTERN INTERRUPTS — the first 2 seconds must be so unexpected or bold that the thumb physically stops scrolling.

Rules for this template:
- Hook must be a pattern interrupt: POV format, shocking stat, bold contrarian claim, or a "wait what?" moment
- Zero slow burn. Scene 1 is already mid-action, not setup
- Pacing is FAST: 2-3 second scenes max, rapid cuts
- Every scene communicates through expressive action, striking props, and immediate visual contrast
- CTA is delivered in voiceover while an emphatic gesture and immediate product interaction create urgency visually
- Music: trending, high-energy, beat-matched to cuts
- Total feel: raw, immediate, shareable — NOT polished corporate`,

  "ugc-review": `You are a UGC (User Generated Content) director who makes ads that feel 100% like real customer videos, not ads. The goal is authentic skeptic-to-believer arc.

Rules for this template:
- Hook must open with doubt/skepticism: "I was skeptical", "I almost didn't try this", "My friend kept pushing this on me"
- First-person throughout — script as if a real person is talking to their phone camera
- Handheld, casual feel — directions should say "talking directly to camera", "messy room background", "natural lighting"
- Include a genuine-feeling "discovery moment" — the moment they noticed it working
- End with an honest recommendation, NOT a sales pitch
- Music: none or very subtle ambient
- Total feel: your friend texting you a recommendation, not a brand talking at you`,

  "before-after": `You are a transformation narrative director. You specialize in the most emotionally powerful video format: contrast. The BEFORE state must create visceral empathy. The AFTER state must feel like relief.

Rules for this template:
- Open ON the problem/pain state — make the viewer feel it before showing the product
- Never say the word "before" or "after" — SHOW the contrast, don't narrate it
- The pivot/turning point scene is the most important scene — this is the "I found this" moment
- After state should be specific and sensory: not "I feel better" but "I slept 8 hours for the first time in years"
- Visual directions: split screen option, or hard cut to completely different environment/energy
- CTA should reference the transformation, not the product: "start your transformation"
- Music: starts low/melancholic, builds to uplifting at the reveal`,

  "product-demo": `You are a product demonstration director. Your demos make features irrelevant — you show BENEFITS in real use. Viewers should see themselves using it.

Rules for this template:
- Open with the problem statement — why does someone need this?
- Each scene shows ONE feature being used, immediately followed by the benefit/result
- Close-up product shots with hands — shows scale, texture, ease of use
- Include at least one "unexpected" feature reveal that creates a "wait, it does THAT too?" moment
- Comparison moment: briefly acknowledge what they were using before and why this is better
- Music: upbeat, professional, slightly techy if appropriate
- Total feel: a knowledgeable friend showing you something amazing they found`,

  "product-unboxing": `You are an unboxing experience director. You understand that unboxing is about ANTICIPATION and REWARD. The packaging is part of the product.

Rules for this template:
- Build anticipation BEFORE the box opens — reference how long they waited, the shipping experience, the hype
- Packaging reveal is its OWN scene — premium packaging deserves its moment
- First-look reaction must be genuine and visceral — describe the sensory experience: weight, texture, smell, first impression
- Show the product in context immediately after first hold — not just looking at it, using it
- Final scene: verdict as if talking to a friend "should you buy it? here's my honest take"
- Music: builds in excitement through the video
- Total feel: Christmas morning energy`,

  "flash-sale": `You are a direct response copywriter specializing in urgency-driven video. Every second of this video is engineered to create the feeling: "if I don't act RIGHT NOW I will miss this."

Rules for this template:
- Open by showing scarcity through nearly empty shelving and accelerating fulfillment activity — never reveal the product before establishing urgency
- Make the offer reveal a decisive visual moment through an abundant product bundle, excited reactions, and accelerated packing activity
- Escalate urgency visually through increasingly sparse inventory, faster movement, and eager customers claiming the remaining packages
- No time for a narrative arc — communicate the offer entirely through product quantity, action, reactions, and editing rhythm
- CTA must make urgency tangible through rapidly emptying shelves, dwindling inventory, or a final package being claimed
- Music: urgent, fast tempo, slightly anxious energy
- Total feel: the energy of spotting the final available item and rushing to claim it`,

  "amazon-listing": `You are an Amazon conversion specialist. Amazon shoppers are comparison shopping — your video must win the "why this one" argument before they go to a competitor.

Rules for this template:
- Lead with the TOP benefit (not a feature) — the #1 reason someone buys this
- Show the product from multiple angles with clean, well-lit visuals
- Include a "vs alternatives" moment — what makes this better than what they might already have?
- Show scale/dimensions in a relatable way (next to a common object, in someone's hand)
- Convey customer confidence through a montage of varied people repeatedly choosing, using, and recommending the product
- End with a reassuring ownership moment: swift doorstep delivery, durable use, and a visibly satisfied customer
- Music: clean, professional, minimal
- Total feel: a product you'd feel confident buying without reading all the reviews`,

  "brand-story": `You are an emotional brand storytelling director. You've directed campaigns for brands that went from zero to household names. You know that brands are built on WHY, not WHAT.

Rules for this template:
- Open with the ORIGIN MOMENT — the specific day/event that created the need for this brand
- Founder perspective or customer perspective — never corporate voice
- The mission must be clear: what injustice or gap were you fixing?
- Include a "we almost quit" or "it wasn't easy" vulnerability moment — this builds trust
- Show who it's FOR with specificity — not "people" but "the mom who..."
- Close with an invitation, not a sale: "join us", "be part of this", "this is for you"
- Music: cinematic, emotional, builds to hopeful
- Total feel: a mini-documentary that makes you believe in something`,

  "testimonial-compilation": `You are a social proof architect. You know that multiple voices saying the same thing is 10x more powerful than one perfect testimonial. Your job is to create social proof overload.

Rules for this template:
- Open with a number: "47 people tried this. Here's what happened."
- Each testimonial is SHORT — 3-5 seconds — no full stories, just the best line from each
- Diversity of voice matters: different ages, backgrounds, use cases — all confirming the same core benefit
- Build to a consensus moment: a beat where multiple voices echo the same result
- End testimonial has the strongest result / most surprising outcome
- Reinforce each clip with expressive reactions, matched actions, and clear product-result visuals
- Music: upbeat, builds energy, social/shareable feel
- Total feel: the comment section of a viral video brought to life`,

  "shopify-promo": `You are a DTC (direct-to-consumer) social commerce specialist. You bridge aspiration and purchase in 30 seconds.

Rules for this template:
- Open in the lifestyle — show the result/feeling before the product
- The product appears naturally in context, not forced or staged
- Include a genuine value moment — reveal a generous bundle or useful extras through an appealing product arrangement and delighted reaction
- Sustain purchase momentum through aspirational product use, delighted reactions, and seamless delivery imagery
- Show the purchase/shipping experience as part of the fantasy: unboxing, delivery excitement
- Strong visual aesthetic — this is a DTC brand, not a mass market product
- Music: trendy, aspirational, genre-appropriate to the product
- Total feel: your aspirational friend's Instagram becoming shoppable`,

  "tutorial": `You are an educational content director who understands that teaching is the most powerful form of selling. When you solve someone's problem, they trust you enough to buy from you.

Rules for this template:
- Open with a PROBLEM + PROMISE: "Here's why X isn't working — and how to fix it in 3 steps"
- Make each step visually distinct through sequential actions, changing camera positions, and clearly differentiated props
- Close-up shots of hands doing the technique — viewers must be able to follow along
- The product appears as THE TOOL that makes each step possible (not the subject, the tool)
- Include a "common mistake" moment — this is a trust-building insight that shows expertise
- End with the result you get when you follow all steps + where to get the product
- Music: focused, instructional, medium tempo
- Total feel: the YouTube video you actually learn something from`,

  "instagram-reel": `You are an Instagram aesthetic director. Instagram Reels are won on the FIRST FRAME and the SOUND. You create visual stories that stop the scroll through beauty, not shock.

Rules for this template:
- First frame must be visually stunning — a hero shot, not a talking head
- Color grade direction matters: specify the mood (warm golden hour, cool minimal white, moody dark)
- Communicate the editorial idea through composed lifestyle imagery, purposeful product placement, and a recurring visual motif
- Trend-aware: reference current Reel formats (day in my life, get ready with me, GRWM, aesthetic vlog)
- Product appears in lifestyle context — never isolated on white background
- CTA feels organic: "save this", "send to a friend who needs this", not "buy now"
- Music: specific genre recommendation, trending audio style
- Total feel: a post you'd save to your collection, then buy from`,
};

// Generic fallback for any template type not specifically defined
const GENERIC_SYSTEM_PROMPT = `You are a world-class video ad scriptwriter for e-commerce brands. Transform product descriptions into cinematic, conversion-optimized video scripts.`;

const VISUAL_STORYTELLING_RULE = `All meaning in the generated visuals must come from action, composition, props, performance, camera work, lighting, and editing. Do not include text overlays, captions, typography, written words, countdown timers, on-screen prices, star ratings, visible logos, or website URLs anywhere in the video.`;

router.get("/studio/models", (_req, res) => {
  res.json(RENDERING_MODELS);
});

// Script generation via OpenAI
router.post("/studio/expand-prompt", async (req, res) => {
  // Script expansion invokes a paid provider and must never be reachable
  // anonymously. Resolve auth before validating content to avoid leaking route
  // behavior to unauthenticated callers.
  const userId = await resolveUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const parsed = ExpandPromptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { description, productName, targetAudience, platform, duration } = parsed.data;
  const templateType = (req.body as any).templateType as string | undefined;
  const templateName = (req.body as any).templateName as string | undefined;
  const effectiveSec = parseRequestedDuration(duration);
  const effectiveDuration = `${effectiveSec}s`;
  const planningContract = durationPlanInstruction(effectiveSec, templateType);

  const baseSystemPrompt = templateType
    ? (TEMPLATE_SYSTEM_PROMPTS[templateType] ?? GENERIC_SYSTEM_PROMPT)
    : GENERIC_SYSTEM_PROMPT;

  const systemPrompt = `${baseSystemPrompt}

${VISUAL_STORYTELLING_RULE}

${planningContract}

Write like an elite direct-response creative director. Be product- and audience-specific, use believable demonstrations and reactions, and never invent an unsupported claim. Avoid generic filler such as "unlock your potential", "discover the future", or "revolutionize your life". Voiceover is spoken audio only and must remain separate from visual directions. Target natural narration at no more than 2.7 words per second.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "script": "full cinematic script",
  "hook": "scroll-stopping opening line (first 2-3 seconds)",
  "callToAction": "specific CTA text",
  "scenes": [
    { "sceneNumber": 1, "description": "what happens in this scene", "duration": "3s", "visualDirection": "exact camera angle, movement, lighting, performance, and visual storytelling" }
  ],
  "voiceoverText": "complete voiceover narration — every word spoken",
  "suggestedMusic": "specific music mood, tempo, and genre",
  "estimatedDuration": "${effectiveDuration}"
}`;

  const templateContext = templateType
    ? `Template format: ${templateName || templateType} — follow the structural rules for this format exactly.`
    : "";

  const userPrompt = `Write a high-converting video ad script for this product:

Product: ${productName}
Description: ${description}
Audience: ${targetAudience || "general consumers"}
Platform: ${platform || "multi-platform"}
Duration: ${effectiveDuration}
${templateContext}

IMPORTANT: This is a ${effectiveDuration} video — the script, scenes, and voiceover MUST fit within ${effectiveDuration}. Do not write more content than ${effectiveSec} seconds of video can show. Every second counts — be punchy, not padded.

The hook must stop the scroll in the first 2-3 seconds. Every scene must be purposeful. The script must feel like it was made FOR this specific template format — not a generic ad.`;

  try {
    console.log(`[openai] Generating script — template: ${templateType ?? "generic"}, platform: ${platform}, duration: ${duration}`);

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[openai] no JSON found in response:", text.slice(0, 300));
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }
    let generated = JSON.parse(jsonMatch[0]) as AdScript;
    let failures = validateScript(generated, effectiveSec, templateType);
    if (failures.length) {
      const repair = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        max_tokens: 8192,
        messages: [
          { role: "system", content: `${systemPrompt}\nRepair only the invalid sections listed by the user. Preserve every valid, product-specific section.` },
          { role: "user", content: `Validation failures: ${failures.join("; ")}\n\nRepair this JSON and return the complete valid JSON only:\n${JSON.stringify(generated)}` },
        ],
      });
      const repairedText = repair.choices[0]?.message?.content ?? "";
      const repairedJson = repairedText.match(/\{[\s\S]*\}/);
      if (repairedJson) generated = JSON.parse(repairedJson[0]) as AdScript;
    }
    generated = normalizeScriptTiming(generated, effectiveSec);
    generated.scenes = generated.scenes.map(scene => ({
      ...scene,
      description: sanitizeVisualPrompt(scene.description),
      visualDirection: sanitizeVisualPrompt(scene.visualDirection),
    }));
    failures = validateScript(generated, effectiveSec, templateType);
    if (failures.length) console.warn("[openai] script retained non-timing validation warnings after repair:", failures);
    res.json(generated);
  } catch (err: any) {
    console.error("[openai] expand-prompt error:", err?.message ?? err);
    res.status(500).json({ error: "AI generation failed — please try again in a moment" });
  }
});

// Per-scene regeneration — rewrites only the requested scene
router.post("/studio/regenerate-scene", async (req, res) => {
  const userId = await resolveUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const body = req.body as {
    sceneIndex?: number;
    sceneNumber?: number;
    currentDescription?: string;
    currentVisualDirection?: string;
    totalScenes?: number;
    productName?: string;
    description?: string;
    targetAudience?: string;
    platform?: string;
    duration?: string;
    templateType?: string;
    templateName?: string;
    hint?: string;
  };

  const {
    sceneNumber,
    currentDescription,
    currentVisualDirection,
    totalScenes,
    productName,
    description,
    targetAudience,
    platform,
    duration,
    templateType,
    templateName,
    hint,
  } = body;

  if (!sceneNumber || !productName || !description) {
    res.status(400).json({ error: "sceneNumber, productName and description are required" });
    return;
  }

  const baseSystemPrompt = templateType
    ? (TEMPLATE_SYSTEM_PROMPTS[templateType] ?? GENERIC_SYSTEM_PROMPT)
    : GENERIC_SYSTEM_PROMPT;

  const systemPrompt = `${baseSystemPrompt}

${VISUAL_STORYTELLING_RULE}

You are rewriting a SINGLE scene from an existing video ad script. Keep it consistent with the overall product and video style.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "description": "what happens in this scene",
  "visualDirection": "exact camera angle, movement, lighting, performance, and visual storytelling"
}`;

  const userPrompt = `Rewrite Scene ${sceneNumber} of ${totalScenes} for this product:

Product: ${productName}
Description: ${description}
Audience: ${targetAudience || "general consumers"}
Platform: ${platform || "multi-platform"}
Duration: ${duration || "30s"}
${templateType ? `Template: ${templateName || templateType}` : ""}

Current scene description:
"${currentDescription}"

Current visual direction:
"${currentVisualDirection}"
${hint ? `\nUser guidance: ${hint}` : ""}

Write a fresh version of this scene. The description should be vivid and purposeful. The visualDirection should be specific about camera, movement, lighting, performance, and purely visual storytelling. Do NOT copy the existing scene — rewrite it with fresh creative energy while keeping it consistent with the product and ad format.`;

  try {
    console.log(`[openai] Regenerating scene ${sceneNumber}/${totalScenes} — hint: ${hint ? "yes" : "none"}`);

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[openai] no JSON in regenerate-scene response:", text.slice(0, 300));
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }
    const scene = JSON.parse(jsonMatch[0]) as { description: string; visualDirection: string };
    res.json({
      ...scene,
      description: sanitizeVisualPrompt(scene.description),
      visualDirection: sanitizeVisualPrompt(scene.visualDirection),
    });
  } catch (err: any) {
    console.error("[openai] regenerate-scene error:", err?.message ?? err);
    res.status(500).json({ error: "AI generation failed — please try again in a moment" });
  }
});

export default router;
