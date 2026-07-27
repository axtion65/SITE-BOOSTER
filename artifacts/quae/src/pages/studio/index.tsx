import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { RequireAuth } from "@/components/auth-guard";
import { useExpandPrompt, useListRenderingModels, useCreateProject } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Wand2, Film, Download, CheckCircle2, ChevronRight, Activity, Zap, Crown, Lock, ChevronDown, LayoutTemplate, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { ExpandedScript } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

export default function StudioIndex() {
  return (
    <RequireAuth>
      <div className="h-full flex flex-col">
        <Wizard />
      </div>
    </RequireAuth>
  );
}

function Wizard() {
  const [step, setStep] = useState(1);
  const [modelId, setModelId] = useState<string>("ovi");

  // Step 1 State
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [duration, setDuration] = useState("15s");

  // Step 2 State
  const [expandedScript, setExpandedScript] = useState<ExpandedScript | null>(null);

  const { data: models, isLoading: modelsLoading } = useListRenderingModels();
  const expandMutation = useExpandPrompt();
  const createMutation = useCreateProject();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const [templateId, setTemplateId] = useState<string | undefined>();
  const [templateType, setTemplateType] = useState<string | undefined>();
  const [templateName, setTemplateName] = useState<string | undefined>();
  const [templateExampleHook, setTemplateExampleHook] = useState<string | undefined>();
  const [templateStructure, setTemplateStructure] = useState<string[] | undefined>();
  const [templateCardExpanded, setTemplateCardExpanded] = useState(false);

  // Pre-fill from template URL params
  const templateApplied = useRef(false);
  useEffect(() => {
    if (templateApplied.current) return;
    const params = new URLSearchParams(search);
    const tName = params.get("templateName");
    const tPlatform = params.get("platform");
    const tDuration = params.get("duration");
    const tDesc = params.get("templateDesc");
    const tId = params.get("templateId");
    const tType = params.get("templateType");
    const tHook = params.get("exampleHook");
    const tStructureRaw = params.get("structure");
    if (tName || tPlatform || tDuration || tId) {
      templateApplied.current = true;
      if (tDesc) setDescription(tDesc.startsWith("http") ? "" : "");  // don't pre-fill desc with template desc
      if (tPlatform) setPlatform(tPlatform.toLowerCase().replace(" ", ""));
      if (tDuration) setDuration(tDuration);
      if (tId) setTemplateId(tId);
      if (tType) setTemplateType(tType);
      if (tName) setTemplateName(tName);
      if (tHook) setTemplateExampleHook(tHook);
      if (tStructureRaw) {
        try { setTemplateStructure(JSON.parse(tStructureRaw)); } catch {}
      }
    }
  }, [search]);

  const handleExpand = async () => {
    if (!productName || !description) {
      toast({ title: "Missing fields", description: "Product name and description are required.", variant: "destructive" });
      return;
    }
    try {
      const res = await expandMutation.mutateAsync({
        data: { productName, description, targetAudience, platform, duration, templateType, templateName } as any
      });
      setExpandedScript(res);
      setStep(2);
    } catch (err: any) {
      toast({ title: "Script generation failed", description: err.message || "AI failed to generate script", variant: "destructive" });
    }
  };

  const handleSaveProject = async () => {
    if (!modelId) {
      toast({ title: "No model selected", variant: "destructive" });
      return;
    }
    try {
      const res = await createMutation.mutateAsync({
        data: {
          title: `${productName} Ad`,
          description,
          renderingModelId: modelId,
          expandedScript: JSON.stringify(expandedScript),
          platform,
          duration,
          templateId: templateId ?? null,
        }
      });
      toast({ title: "Rendering started!", description: "Your video is processing. We'll notify you when it's ready." });
      setLocation(`/studio/projects/${res.id}`);
    } catch (err: any) {
      if (err.message?.includes("credits")) {
        toast({ title: "Not enough credits", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Save failed", description: err.message, variant: "destructive" });
      }
    }
  };

  const selectedModel = models?.find(m => m.id === modelId);
  const userCredits = (user as any)?.credits ?? 0;
  const userPlan = (user as any)?.plan ?? "free";

  const planTierOrder = { free: 0, starter: 1, pro: 2, agency: 3 };

  function canUseModel(modelTier: string) {
    return (planTierOrder[modelTier as keyof typeof planTierOrder] ?? 0) <= (planTierOrder[userPlan as keyof typeof planTierOrder] ?? 0);
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Step progress header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 z-10">
        <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
          {["Describe", "AI Script", "AI Model", "Render"].map((label, i) => (
            <div key={i} className="flex items-center gap-4">
              {i > 0 && <ChevronRight className="h-4 w-4" />}
              <span className={step >= i + 1 ? "text-primary font-semibold" : ""}>{i + 1}. {label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="font-bold text-white">{userCredits}</span>
            <span className="text-muted-foreground">credits</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-12 scroll-smooth">
        <div className="max-w-3xl mx-auto">

          {/* STEP 1 — Describe */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Describe your product</h2>
                <p className="text-muted-foreground">Tell us what you're selling. Our AI writes the cinematic script.</p>
              </div>

              {/* Template context card — shown only when a template is active */}
              {templateName && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-primary/10 transition-colors"
                    onClick={() => setTemplateCardExpanded(v => !v)}
                  >
                    <div className="flex items-center gap-2.5">
                      <LayoutTemplate className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm font-semibold text-white">Template:</span>
                      <span className="text-sm font-bold text-primary">{templateName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href="/templates"
                        onClick={e => { e.stopPropagation(); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Change template
                      </a>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${templateCardExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {templateCardExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-primary/20">
                      {templateExampleHook && (
                        <div>
                          <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Example Hook</div>
                          <p className="text-sm italic text-white/80">"{templateExampleHook}"</p>
                        </div>
                      )}
                      {templateStructure && templateStructure.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">Structure</div>
                          <div className="space-y-1.5">
                            {templateStructure.slice(0, 3).map((step, i) => (
                              <div key={i} className="flex items-start gap-2.5">
                                <div className="h-5 w-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                                </div>
                                <span className="text-xs text-white/70 leading-relaxed">{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Product Name</Label>
                  <Input
                    placeholder="e.g. Lumina Sleep Mask"
                    className="h-12 text-lg"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Product Description & Benefits</Label>
                  <Textarea
                    placeholder="What does it do? Why is it great? What problem does it solve?"
                    className="min-h-[120px] text-base resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Input
                      placeholder="e.g. Insomniacs"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="instagram">Instagram Reels</SelectItem>
                        <SelectItem value="youtube">YouTube Shorts</SelectItem>
                        <SelectItem value="amazon">Amazon Listing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15s">15 Seconds</SelectItem>
                        <SelectItem value="30s">30 Seconds</SelectItem>
                        <SelectItem value="60s">60 Seconds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-bold shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] transition-all"
                  onClick={handleExpand}
                  disabled={expandMutation.isPending}
                >
                  {expandMutation.isPending ? <Spinner className="mr-2 h-5 w-5" /> : <Sparkles className="mr-2 h-5 w-5" />}
                  {expandMutation.isPending ? "Writing cinematic script…" : "Generate Script with AI"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 — Script Review */}
          {step === 2 && expandedScript && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Cinematic Script Generated</h2>
                  <p className="text-muted-foreground">Review the scenes and voiceover. Looks good? Let's pick the model.</p>
                </div>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              </div>

              <Card className="border-primary/20 bg-primary/5">
                <div className="p-6 border-b border-primary/10">
                  <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">The Hook</div>
                  <div className="text-xl font-medium italic">"{expandedScript.hook}"</div>
                </div>
                <div className="p-0">
                  {expandedScript.scenes.map((scene, idx) => (
                    <div key={idx} className="flex border-b border-primary/10 last:border-0">
                      <div className="w-16 flex-shrink-0 flex items-center justify-center border-r border-primary/10 bg-black/20 font-mono text-muted-foreground text-sm">
                        {scene.duration}
                      </div>
                      <div className="p-4 flex-1">
                        <div className="text-sm font-semibold text-white mb-1">Scene {scene.sceneNumber}</div>
                        <p className="text-sm text-muted-foreground mb-2">{scene.description}</p>
                        <div className="flex items-start gap-2 bg-black/40 rounded p-2 text-xs">
                          <Film className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                          <span className="text-white/80">{scene.visualDirection}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="bg-card border border-border rounded-xl p-6">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Full Voiceover</div>
                <p className="text-sm leading-relaxed">{expandedScript.voiceoverText}</p>
              </div>

              <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={() => setStep(3)}>
                Looks Good — Choose Model <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* STEP 3 — Model Picker */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Choose Your AI Model</h2>
                  <p className="text-muted-foreground">Higher models = more cinematic output. Credits charged on render.</p>
                </div>
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              </div>

              {/* Honest clip-length notice — shown once above the grid */}
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400/80 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                <span>
                  <strong className="text-amber-400">AI video models generate short clips</strong> — output length depends on the model, not your script duration.
                  Ovi outputs ~5 sec, Wan ~8 sec, Kling ~10 sec. For longer ads, combine multiple renders.
                </span>
              </div>

              {modelsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(models ?? []).map((model) => {
                    const isSelected = modelId === model.id;
                    const canUse = canUseModel(model.tier);
                    const clipMap: Record<string, string> = {
                      ovi: '~5 sec', wan: '~8 sec', kling: '~10 sec', veo3: '~8 sec'
                    };
                    const clipLen = clipMap[model.id] ?? '~5 sec';
                    return (
                      <button
                        key={model.id}
                        onClick={() => canUse && setModelId(model.id)}
                        disabled={!canUse}
                        className={`p-5 rounded-2xl border text-left transition-all relative ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                            : canUse
                              ? "border-border bg-card hover:border-white/20 hover:bg-white/5"
                              : "border-border bg-card opacity-50 cursor-not-allowed"
                        }`}
                      >
                        {model.badge && (
                          <span className="absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                            {model.badge}
                          </span>
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          {!canUse && <Lock className="h-4 w-4 text-muted-foreground" />}
                          {canUse && isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                          {canUse && !isSelected && <Activity className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-bold text-white">{model.name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{model.description}</p>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {model.capabilities.slice(0, 3).map((cap, ci) => (
                            <span key={ci} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/10">{cap}</span>
                          ))}
                        </div>
                        {/* Clip length — prominent, honest */}
                        <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/50">
                          Output clip: <span className="text-white font-bold">{clipLen}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Zap className="h-4 w-4 text-primary" />
                            <span className="font-black text-white text-lg">{(model as any).creditCost ?? 30}</span>
                            <span className="text-muted-foreground text-sm">credits</span>
                          </div>
                          {!canUse && (
                            <span className="text-xs text-amber-400 border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 rounded-full capitalize">
                              {model.tier} plan
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedModel && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Selected: <span className="text-white font-semibold">{selectedModel.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-white font-bold">{(selectedModel as any).creditCost ?? 30}</span>
                    <span className="text-muted-foreground">/ {userCredits} credits remaining</span>
                  </div>
                </div>
              )}

              <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={() => setStep(4)} disabled={!modelId}>
                Confirm Model <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* STEP 4 — Render */}
          {step === 4 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-12">
              <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Wand2 className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Ready to Render</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-2">
                Your script is locked in and the model is selected. Hit render — we'll submit your video to{" "}
                <span className="text-white font-semibold">{selectedModel?.name ?? "Ovi"}</span> and you can track progress in your projects.
              </p>
              {selectedModel && (
                <p className="text-sm text-amber-400">
                  This will use <span className="font-bold">{(selectedModel as any).creditCost ?? 30} credits</span> from your balance ({userCredits} remaining)
                </p>
              )}

              <div className="flex gap-4 justify-center mt-8">
                <Button variant="outline" size="lg" onClick={() => setStep(3)}>Back</Button>
                <Button
                  size="lg"
                  onClick={handleSaveProject}
                  disabled={createMutation.isPending}
                  className="font-bold min-w-[200px] shadow-[0_0_20px_rgba(124,58,237,0.3)]"
                >
                  {createMutation.isPending ? (
                    <><Spinner className="mr-2" /> Submitting…</>
                  ) : (
                    <><Download className="mr-2 h-5 w-5" /> Start Render</>
                  )}
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
