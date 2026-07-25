import { Router } from "express";
import { ExpandPromptBody } from "@workspace/api-zod";

const router = Router();

// Real fal.ai models — credits shown to users
const RENDERING_MODELS = [
  {
    id: "ovi",
    name: "Ovi",
    description: "AI video with native audio. Best value — 30 credits per video.",
    capabilities: ["Video + audio", "Fast render", "All platforms", "Commercial use"],
    creditCost: 30,
    tier: "free",
    badge: "Best Value",
  },
  {
    id: "wan",
    name: "Wan 2.5",
    description: "High-quality cinematic video. 200 credits per video.",
    capabilities: ["Cinematic quality", "Detailed scenes", "Pro motion", "All platforms"],
    creditCost: 200,
    tier: "starter",
    badge: "Popular",
  },
  {
    id: "kling",
    name: "Kling 2.5 Turbo",
    description: "Premium AI video with ultra-realistic rendering. 300 credits per video.",
    capabilities: ["Ultra-realistic", "Product focus", "Premium output", "Brand-safe"],
    creditCost: 300,
    tier: "pro",
    badge: "Premium",
  },
  {
    id: "veo3",
    name: "Veo 3",
    description: "Google's flagship model — unmatched realism. 1500 credits per video.",
    capabilities: ["Photorealistic", "4K quality", "Best-in-class", "Agency grade"],
    creditCost: 1500,
    tier: "agency",
    badge: "Agency",
  },
];

router.get("/studio/models", (_req, res) => {
  res.json(RENDERING_MODELS);
});

// Script generation via fal.ai any-llm — bills your fal.ai account, zero Replit credits
router.post("/studio/expand-prompt", async (req, res) => {
  const parsed = ExpandPromptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const falKey = process.env.FAL_KEY;
  if (!falKey) { res.status(500).json({ error: "FAL_KEY not configured" }); return; }

  const { description, productName, targetAudience, platform, duration } = parsed.data;

  const systemPrompt = `You are a world-class video ad scriptwriter for e-commerce brands. Transform product descriptions into cinematic, conversion-optimized video scripts.

Respond with ONLY valid JSON:
{
  "script": "full cinematic script",
  "hook": "scroll-stopping opening line (first 3 seconds)",
  "callToAction": "specific CTA text",
  "scenes": [
    { "sceneNumber": 1, "description": "scene description", "duration": "5s", "visualDirection": "detailed visual/camera direction" }
  ],
  "voiceoverText": "complete voiceover narration",
  "suggestedMusic": "music mood/style",
  "estimatedDuration": "30s"
}`;

  const userPrompt = `Write a high-converting video ad script:
Product: ${productName}
Description: ${description}
Audience: ${targetAudience || "general consumers"}
Platform: ${platform || "multi-platform"}
Duration: ${duration || "30s"}

Hook must stop the scroll in 3 seconds. Every scene must be purposeful and cinematic.`;

  try {
    const falRes = await fetch("https://fal.run/fal-ai/any-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4.5",
        system_prompt: systemPrompt,
        prompt: userPrompt,
        max_tokens: 8192,
      }),
    });

    if (!falRes.ok) {
      console.error("[fal-llm] error:", falRes.status, await falRes.text());
      res.status(500).json({ error: "AI generation failed" });
      return;
    }

    const data = await falRes.json() as { output?: string };
    const text = data.output ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Failed to parse AI response" }); return; }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("[fal-llm] error:", err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
