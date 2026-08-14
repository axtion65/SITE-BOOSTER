import type { ExpandedScript } from "@workspace/api-client-react";

export interface PreviewRenderBrief {
  shortened: boolean;
  renderDurationSeconds: number;
  visualBeats: string[];
  marketingMessage: string;
  voiceoverText: string;
}

export function compilePreviewRenderBrief(script: ExpandedScript, requestedSeconds: number, nativeSeconds: number): PreviewRenderBrief {
  const renderDurationSeconds = Math.min(requestedSeconds, nativeSeconds);
  const shortened = nativeSeconds < requestedSeconds;
  if (!shortened) return {
    shortened, renderDurationSeconds,
    visualBeats: script.scenes.map(scene => `${scene.description} ${scene.visualDirection}`.trim()),
    marketingMessage: script.callToAction || script.hook,
    voiceoverText: script.voiceoverText,
  };
  const maxWords = Math.max(3, Math.floor(renderDurationSeconds * 2.4));
  const approved = [script.callToAction, script.hook, ...script.voiceoverText.split(/(?<=[.!?])\s+/)].filter(Boolean);
  const marketingMessage = approved.find(line => /[$€£]\s?\d/.test(line) && line.split(/\s+/).length <= maxWords)
    ?? approved.find(line => line.split(/\s+/).length <= maxWords) ?? approved[0] ?? "";
  return {
    shortened, renderDurationSeconds,
    visualBeats: script.scenes.slice(0, renderDurationSeconds <= 5 ? 1 : 2).map(scene => `${scene.description} ${scene.visualDirection}`.trim()),
    marketingMessage,
    voiceoverText: marketingMessage.split(/\s+/).slice(0, maxWords).join(" ").replace(/[,;:]$/, ""),
  };
}
