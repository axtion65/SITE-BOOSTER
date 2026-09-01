import type { ExpandedScript } from "@workspace/api-client-react";

export interface PreviewRenderBrief {
  shortened: boolean;
  renderDurationSeconds: number;
  visualBeats: string[];
  marketingMessage: string;
  voiceoverText: string;
  visualProductionBrief: string;
}

const VISUAL_PRODUCTION_BRIEF = "Produce a coherent multi-scene business advertisement. Each approved scene becomes its own purposeful shot; Quae assembles the complete timeline with the measured voiceover, deterministic captions, branding, and CTA. Avoid generated text, signs, UI, random symbols, and background lettering inside provider footage.";

export function compilePreviewRenderBrief(script: ExpandedScript, requestedSeconds: number, nativeSeconds: number): PreviewRenderBrief {
  void nativeSeconds;
  const renderDurationSeconds = requestedSeconds;
  return {
    shortened: false, renderDurationSeconds,
    visualBeats: script.scenes.map(scene => `${scene.description} ${scene.visualDirection}`.trim()),
    marketingMessage: script.callToAction || script.hook,
    voiceoverText: script.voiceoverText,
    visualProductionBrief: VISUAL_PRODUCTION_BRIEF,
  };
}
