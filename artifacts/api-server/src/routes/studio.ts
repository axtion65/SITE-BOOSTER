import { Router } from "express";
import { ExpandPromptBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

const RENDERING_MODELS = [
  {
    id: "quae-v1",
    name: "Quae Render Engine",
    description: "AI-generated scene images (fal.ai FLUX) assembled with music and text overlays via Shotstack.",
    capabilities: ["AI scene images", "Background music", "Text overlays", "Multi-platform"],
    tier: "standard",
    badge: null,
  },
];

router.get("/studio/models", (_req, res) => {
  res.json(RENDERING_MODELS);
});

router.post("/studio/expand-prompt", async (req, res) => {
  const parsed = ExpandPromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { description, productName, targetAudience, platform, duration } = parsed.data;

  const systemPrompt = `You are a world-class video script writer specializing in high-converting product ads for e-commerce entrepreneurs. Your job is to transform a basic product description into a detailed, cinematic video script optimized for maximum viewer engagement and conversion.

You must respond with ONLY valid JSON matching this exact structure:
{
  "script": "full detailed cinematic script",
  "hook": "opening hook line (first 3 seconds)",
  "callToAction": "specific CTA text",
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "what happens in this scene",
      "duration": "5s",
      "visualDirection": "detailed visual/camera direction"
    }
  ],
  "voiceoverText": "complete voiceover narration",
  "suggestedMusic": "music mood/style suggestion",
  "estimatedDuration": "30s"
}`;

  const userPrompt = `Create a cinematic video script for this product:

Product Name: ${productName}
Description: ${description}
Target Audience: ${targetAudience || "general consumers"}
Platform: ${platform || "multi-platform"}
Duration: ${duration || "30s"}

Write a conversion-optimized video script. The hook must stop the scroll in under 3 seconds. Make every scene purposeful and cinematic.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }
    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
