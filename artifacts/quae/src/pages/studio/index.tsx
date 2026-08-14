import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { RequireAuth } from "@/components/auth-guard";
import { useExpandPrompt, useListRenderingModels, useCreateProject, useRegenerateScene } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Wand2, Film, Download, CheckCircle2, ChevronRight, Activity, Zap, Crown, Lock, ChevronDown, LayoutTemplate, ArrowLeft, ImagePlus, X, Info, Pencil, RotateCcw, BadgeCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { ExpandedScript } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { usePrivateImageUrl } from "@/hooks/use-private-image-url";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { approvedCampaignToStudio, shouldRestoreStudioDraft, type ApprovedCampaignHandoff } from "@/lib/campaign-handoff";
import { compilePreviewRenderBrief } from "@/lib/render-brief";

const STORAGE_KEY = "quae_studio_draft";

interface StudioDraft {
  step: number;
  modelId: string;
  voiceId: string;
  productName: string;
  description: string;
  targetAudience: string;
  platform: string;
  duration: string;
  /** GCS serving URL (e.g. /api/storage/objects/uploads/uuid). Short path — safe to persist. */
  productImageUrl: string | null;
  productImageFileName: string | null;
  expandedScript: ExpandedScript | null;
  templateId?: string;
  templateType?: string;
  templateName?: string;
  templateExampleHook?: string;
  templateStructure?: string[];
}

function loadDraft(): StudioDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    // Migrate old base64 drafts — drop the data URL, keep the filename
    if (parsed.productImageDataUrl !== undefined) {
      parsed.productImageUrl = null;
      delete parsed.productImageDataUrl;
    }
    // Migrate old productImageObjectPath field name
    if (parsed.productImageObjectPath !== undefined && parsed.productImageUrl === undefined) {
      parsed.productImageUrl = parsed.productImageObjectPath
        ? `/api/storage${parsed.productImageObjectPath}`
        : null;
      delete parsed.productImageObjectPath;
    }
    return parsed as StudioDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: StudioDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // silently ignore if storage is unavailable
  }
}

/**
 * Upload an image file to GCS via the two-step presigned URL flow.
 * Step 1: request a presigned URL + objectPath from the API.
 * Step 2: PUT the file directly to GCS.
 * Step 3: call finalize to set ACL ownership on the now-existing object.
 * Returns the serving URL (e.g. /api/storage/objects/uploads/uuid) on success.
 */
async function uploadImageToStorage(file: File): Promise<string> {
  const token = localStorage.getItem("quae_token");
  const authHeaders: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};

  // Step 1: Request presigned URL
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err.error || "Failed to get upload URL");
  }
  const { uploadURL, objectPath, finalizeToken } = await res.json() as { uploadURL: string; objectPath: string; finalizeToken: string };

  // Step 2: PUT file directly to GCS
  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "image/jpeg" },
  });
  if (!uploadRes.ok) throw new Error("Failed to upload image to storage");

  // Step 3: Finalize — set ACL ownership using the server-issued single-use token
  const finalizeRes = await fetch("/api/storage/uploads/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ objectPath, finalizeToken }),
  });
  if (!finalizeRes.ok) {
    const err = await finalizeRes.json().catch(() => ({})) as any;
    throw new Error(err.error || "Failed to finalize upload");
  }

  return `/api/storage${objectPath}`;
}
function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

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
  const search = useSearch();
  const campaignId = new URLSearchParams(search).get("campaignId")?.trim() || null;

  // Load saved draft once (before state initialisation)
  const savedDraft = shouldRestoreStudioDraft(search) ? loadDraft() : null;

  const [step, setStep] = useState(savedDraft?.step ?? 1);
  const [modelId, setModelId] = useState<string>(savedDraft?.modelId ?? "ltx-fast");
  const [voiceId, setVoiceId] = useState<string>(savedDraft?.voiceId ?? "alloy");

  // Step 1 State
  const [productName, setProductName] = useState(savedDraft?.productName ?? "");
  const [description, setDescription] = useState(savedDraft?.description ?? "");
  const [targetAudience, setTargetAudience] = useState(savedDraft?.targetAudience ?? "");
  const [platform, setPlatform] = useState(savedDraft?.platform ?? "tiktok");
  const [duration, setDuration] = useState(savedDraft?.duration ?? "10s");

  // Product image state
  // productImageUrl: GCS serving URL stored in DB and draft (short path, no bloat)
  const [productImageUrl, setProductImageUrl] = useState<string | null>(savedDraft?.productImageUrl ?? null);
  // imagePreviewUrl: local data URL for thumbnail display only — NOT persisted in draft
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  // signedProductImageUrl: short-lived GCS signed URL resolved from productImageUrl
  const signedProductImageUrl = usePrivateImageUrl(productImageUrl);
  const [productImageFileName, setProductImageFileName] = useState<string | null>(savedDraft?.productImageFileName ?? null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Step 2 State
  const [expandedScript, setExpandedScript] = useState<ExpandedScript | null>(savedDraft?.expandedScript ?? null);

  const [templateId, setTemplateId] = useState<string | undefined>(savedDraft?.templateId);
  const [templateType, setTemplateType] = useState<string | undefined>(savedDraft?.templateType);
  const [templateName, setTemplateName] = useState<string | undefined>(savedDraft?.templateName);
  const [templateExampleHook, setTemplateExampleHook] = useState<string | undefined>(savedDraft?.templateExampleHook);
  const [templateStructure, setTemplateStructure] = useState<string[] | undefined>(savedDraft?.templateStructure);
  const [templateCardExpanded, setTemplateCardExpanded] = useState(false);

  // Track whether there was a restored draft (so we can show a "clear draft" affordance)
  const [draftRestored, setDraftRestored] = useState(!!savedDraft && savedDraft.step > 1);
  const [campaignHandoff, setCampaignHandoff] = useState<ApprovedCampaignHandoff | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(!!campaignId);
  const [campaignMessage, setCampaignMessage] = useState<string | null>(null);

  const updateHook = (value: string) => {
    setScriptEdited(true);
    setExpandedScript(prev => prev ? { ...prev, hook: value } : prev);
  };

  const updateVoiceover = (value: string) => {
    setScriptEdited(true);
    setExpandedScript(prev => prev ? { ...prev, voiceoverText: value } : prev);
  };

  const updateScene = (idx: number, field: "description" | "visualDirection", value: string) => {
    setScriptEdited(true);
    // Manual edits clear the undo history for this scene
    setSceneHistory(prev => { const next = { ...prev }; delete next[idx]; return next; });
    setExpandedScript(prev => {
      if (!prev) return prev;
      const scenes = prev.scenes.map((s, i) => i === idx ? { ...s, [field]: value } : s);
      return { ...prev, scenes };
    });
  };

  const handleRegenerateScene = async (idx: number) => {
    if (!expandedScript) return;
    const scene = expandedScript.scenes[idx];
    // Save current version to undo history before regenerating
    setSceneHistory(prev => ({
      ...prev,
      [idx]: { description: scene.description, visualDirection: scene.visualDirection },
    }));
    setRegeneratingIdx(idx);
    setShowHintFor(null);
    try {
      const result = await regenerateSceneMutation.mutateAsync({
        data: {
          sceneIndex: idx,
          sceneNumber: scene.sceneNumber,
          currentDescription: scene.description,
          currentVisualDirection: scene.visualDirection,
          totalScenes: expandedScript.scenes.length,
          productName,
          description,
          targetAudience: targetAudience || null,
          platform: platform || null,
          duration: duration || null,
          templateType: templateType || null,
          templateName: templateName || null,
          hint: sceneHints[idx] || null,
        },
      });
      setExpandedScript(prev => {
        if (!prev) return prev;
        const scenes = prev.scenes.map((s, i) =>
          i === idx ? { ...s, description: result.description, visualDirection: result.visualDirection } : s
        );
        return { ...prev, scenes };
      });
      setScriptEdited(true);
      // Clear hint after successful regeneration
      setSceneHints(prev => { const next = { ...prev }; delete next[idx]; return next; });
    } catch (err: any) {
      // Clear history if regeneration failed — nothing changed
      setSceneHistory(prev => { const next = { ...prev }; delete next[idx]; return next; });
      toast({
        title: "Regeneration failed",
        description: err.message || "Could not regenerate scene. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingIdx(null);
    }
  };

  // Credit confirmation dialog
  const [showRenderConfirm, setShowRenderConfirm] = useState(false);
  // Models costing ≥ this many credits get a confirmation dialog; cheaper ones proceed directly
  const CONFIRM_CREDIT_THRESHOLD = 100;

  // Tracks whether the user intentionally completed a render (skip unload prompt)
  const renderStartedRef = useRef(false);

  // Warn users before closing the tab / navigating away while mid-wizard (step 2+)
  useEffect(() => {
    if (step < 2) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (renderStartedRef.current) return;
      e.preventDefault();
      // Legacy support: setting returnValue triggers the browser dialog
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step]);

  // Track whether the user has edited the generated script
  const [scriptEdited, setScriptEdited] = useState(false);

  // Wrapper setters: automatically clear a stale script when key inputs change after generation
  const handleProductNameChange = (value: string) => {
    if (expandedScript && value !== productName) setExpandedScript(null);
    setProductName(value);
  };
  const handleDescriptionChange = (value: string) => {
    if (expandedScript && value !== description) setExpandedScript(null);
    setDescription(value);
  };
  const handlePlatformChange = (value: string) => {
    if (expandedScript && value !== platform) setExpandedScript(null);
    setPlatform(value);
  };

  // Per-scene regeneration state
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [showHintFor, setShowHintFor] = useState<number | null>(null);
  const [sceneHints, setSceneHints] = useState<Record<number, string>>({});
  // One-step undo history per scene — stores the pre-regeneration text
  const [sceneHistory, setSceneHistory] = useState<Record<number, { description: string; visualDirection: string }>>({});

  const { data: models, isLoading: modelsLoading } = useListRenderingModels();
  const expandMutation = useExpandPrompt();
  const regenerateSceneMutation = useRegenerateScene();
  const createMutation = useCreateProject();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // The URL supplies only an ID. The authenticated, ownership-scoped API and the
  // server's approved campaign/run state decide whether anything may be hydrated.
  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    const loadCampaign = async () => {
      setCampaignLoading(true);
      try {
        const token = localStorage.getItem("quae_token") || "";
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("missing");
        const handoff = approvedCampaignToStudio(await response.json());
        if (!handoff) {
          if (!cancelled) setCampaignMessage("This campaign is not approved for Creative Studio. You can start a new creative below.");
          return;
        }
        if (cancelled) return;
        setCampaignHandoff(handoff);
        setProductName(handoff.productName);
        setDescription(handoff.description);
        setTargetAudience(handoff.targetAudience);
        setPlatform(handoff.platform);
        setDuration(handoff.duration);
        setExpandedScript(handoff.expandedScript);
        setStep(2);
        setDraftRestored(false);
      } catch {
        if (!cancelled) setCampaignMessage("We couldn’t load that approved campaign. You can start a new creative below or return to Campaigns.");
      } finally {
        if (!cancelled) setCampaignLoading(false);
      }
    };
    void loadCampaign();
    return () => { cancelled = true; };
  }, [campaignId]);

  // Pre-fill from template URL params (only when navigating from template picker)
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

  // Persist draft to sessionStorage whenever relevant state changes
  // productImageUrl is a short GCS path (safe to persist); imagePreviewUrl is local only
  useEffect(() => {
    if (campaignLoading) return;
    saveDraft({
      step,
      modelId,
      voiceId,
      productName,
      description,
      targetAudience,
      platform,
      duration,
      productImageUrl,
      productImageFileName,
      expandedScript,
      templateId,
      templateType,
      templateName,
      templateExampleHook,
      templateStructure,
    });
  }, [
    step, modelId, voiceId, productName, description, targetAudience, platform, duration,
    productImageUrl, productImageFileName, expandedScript,
    templateId, templateType, templateName, templateExampleHook, templateStructure, campaignLoading,
  ]);

  const handleClearDraft = () => {
    clearDraft();
    setStep(1);
    setModelId("wan");
    setProductName("");
    setDescription("");
    setTargetAudience("");
    setPlatform("tiktok");
    setDuration("15s");
    setProductImageUrl(null);
    setImagePreviewUrl(null);
    setProductImageFileName(null);
    setExpandedScript(null);
    setTemplateId(undefined);
    setTemplateType(undefined);
    setTemplateName(undefined);
    setTemplateExampleHook(undefined);
    setTemplateStructure(undefined);
    setDraftRestored(false);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file (JPG, PNG, WebP, etc.)", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please use an image under 10 MB.", variant: "destructive" });
      return;
    }

    // Show a local preview immediately while uploading
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);

    setProductImageFileName(file.name);
    setImageUploading(true);
    try {
      const servingUrl = await uploadImageToStorage(file);
      setProductImageUrl(servingUrl);
    } catch (err: any) {
      toast({ title: "Image upload failed", description: err.message || "Could not upload image. Please try again.", variant: "destructive" });
      setImagePreviewUrl(null);
      setProductImageFileName(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setProductImageUrl(null);
    setImagePreviewUrl(null);
    setProductImageFileName(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleExpand = async () => {
    if (!productName || !description) {
      toast({ title: "Missing fields", description: "Product name and description are required.", variant: "destructive" });
      return;
    }
    try {
      const res = await expandMutation.mutateAsync({
        data: { productName, description, targetAudience, platform, duration, templateType, templateName, renderingModelId: modelId } as any
      });
      setExpandedScript(res);
      setScriptEdited(false);
      setStep(2);
    } catch (err: any) {
      const msg = err.message || "";
      const isServer = msg.includes("500") || msg.includes("Internal");
      toast({
        title: "Script generation failed",
        description: isServer
          ? "Our AI is overloaded — please wait 30 seconds and try again. Your credits were not charged."
          : (msg || "Something went wrong. Please try again."),
        variant: "destructive",
      });
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
          productImageUrl: productImageUrl ?? null,
          voiceId: voiceId ?? "alloy",
        }
      });
      // Clear the saved draft — render has started, work is done
      clearDraft();
      // Mark render as started so the beforeunload prompt is skipped during navigation
      renderStartedRef.current = true;
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
  const isAdminUser = (user as any)?.isAdmin === true;

  // Canonical model clip limits — must match MODEL_MAX_SECONDS in api-server/src/lib/falvideo.ts
  const MODEL_MAX_SECONDS: Record<string, number> = {
    "ltx-fast": 5, ltx: 5, ovi: 10, wan: 10, kling: 10, "kling-1.6": 10, veo3: 8,
  };

  // Parse "15s" → 15, "30s" → 30, "1m" → 60
  function parseDurationSec(d: string): number {
    const s = d.toLowerCase().trim();
    if (s.endsWith("m")) return parseInt(s) * 60;
    if (s.endsWith("s")) return parseInt(s);
    return parseInt(s) || 10;
  }

  // Actual output clip length = min(requested duration, model hard limit)
  function actualClipSec(mId: string, dur: string): number {
    return Math.min(parseDurationSec(dur), (models?.find(model => model.id === mId) as any)?.nativeDurationSeconds ?? MODEL_MAX_SECONDS[mId] ?? 10);
  }

  function clipLabel(mId: string, dur: string): string {
    return `~${actualClipSec(mId, dur)} sec`;
  }

  const planTierOrder = { free: 0, starter: 1, pro: 2, agency: 3 };

  // Admins bypass all tier restrictions so they can test every model
  function canUseModel(_modelTier: string) {
    if (isAdminUser) return true;
    const tier = _modelTier;
    return (planTierOrder[tier as keyof typeof planTierOrder] ?? 0) <= (planTierOrder[userPlan as keyof typeof planTierOrder] ?? 0);
  }

  // Whether the selected model supports image conditioning
  const selectedModelSupportsImage = Boolean((selectedModel as any)?.capabilities?.includes("Image conditioning"));

  const nativeDurationSeconds = (selectedModel as any)?.nativeDurationSeconds ?? MODEL_MAX_SECONDS[modelId] ?? 10;
  const previewRenderBrief = expandedScript
    ? compilePreviewRenderBrief(expandedScript, parseDurationSec(duration), nativeDurationSeconds)
    : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0D1728] relative overflow-hidden before:pointer-events-none before:absolute before:-left-40 before:top-10 before:h-96 before:w-96 before:rounded-full before:bg-blue-500/10 before:blur-3xl">
      {/* Step progress header */}
      <div className="min-h-20 border-b border-white/[.07] flex items-center justify-between gap-4 overflow-x-auto px-5 sm:px-8 bg-[#18263D]/95 shadow-xl z-10">
        <div className="flex shrink-0 items-center gap-4 text-sm text-[#8494AC] font-semibold">
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

      <div className="relative flex-1 overflow-y-auto p-5 md:p-12 scroll-smooth">
        <div className="max-w-3xl mx-auto">

          {campaignLoading && (
            <Card className="mb-6 border-emerald-400/20 bg-emerald-400/5 p-5 text-sm text-emerald-100">
              <Spinner className="mr-2 inline h-4 w-4" /> Loading your approved campaign…
            </Card>
          )}

          {campaignHandoff && (
            <Card className="mb-6 border-emerald-400/30 bg-gradient-to-r from-emerald-400/10 to-primary/10 p-5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-6 w-6 text-emerald-300" /><div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Approved Campaign</p>
                  <h2 className="mt-1 text-lg font-bold text-white">{campaignHandoff.campaignName}</h2>
                  <p className="mt-1 text-sm text-[#B9C5D8]">Your approved campaign has been loaded into Creative Studio.</p>
                </div></div>
                <a href={`/studio/campaigns/${encodeURIComponent(campaignHandoff.campaignId)}`} className="text-sm font-bold text-violet-200 hover:text-white">Back to campaign</a>
              </div>
            </Card>
          )}

          {campaignMessage && (
            <Card className="mb-6 border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100">
              {campaignMessage} <a href="/studio/campaigns" className="ml-1 font-bold underline">View campaigns</a>
            </Card>
          )}

          {/* STEP 1 — Describe */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-[28px] border border-white/[.06] bg-gradient-to-br from-[#20304A] to-[#18263D] p-6 shadow-[0_30px_80px_rgba(2,8,23,.3)] sm:p-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="quae-eyebrow">Premium Creative Studio</p><h2 className="text-3xl font-extrabold tracking-tight text-white mb-2 sm:text-4xl">Describe your product</h2>
                  <p className="text-[#B9C5D8] leading-7">Give your AI creative team the brief. Quae will turn it into a production-ready cinematic script.</p>
                </div>
                {/* Show "start fresh" only when there's a meaningful saved draft */}
                {draftRestored && (
                  <button
                    type="button"
                    onClick={handleClearDraft}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/5"
                    title="Discard saved draft and start over"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Start fresh
                  </button>
                )}
              </div>

              {/* Draft restored banner */}
              {draftRestored && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 text-sm text-white/80">
                  <span className="text-primary text-base">↩</span>
                  <span>Your previous session was restored. Continue where you left off, or <button type="button" onClick={handleClearDraft} className="text-primary hover:underline">start fresh</button>.</span>
                </div>
              )}

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
                    onChange={(e) => handleProductNameChange(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Product Description & Benefits</Label>
                  <Textarea
                    placeholder="What does it do? Why is it great? What problem does it solve?"
                    className="min-h-[120px] text-base resize-none"
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                  />
                </div>

                {/* Product image upload */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>
                      Product Image{" "}
                      <span className="text-muted-foreground font-normal text-xs ml-1">optional</span>
                    </Label>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Info className="h-3 w-3" />
                      <span>Used by Wan &amp; Kling models for image conditioning</span>
                    </div>
                  </div>

                  {imageUploading ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                      {imagePreviewUrl && (
                        <img
                          src={imagePreviewUrl}
                          alt="Product preview"
                          className="h-16 w-16 rounded-lg object-cover border border-white/10 flex-shrink-0 opacity-60"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{productImageFileName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Spinner className="h-3 w-3" />
                          <p className="text-xs text-muted-foreground">Uploading…</p>
                        </div>
                      </div>
                    </div>
                  ) : (productImageUrl || imagePreviewUrl) ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
                      <img
                        src={imagePreviewUrl ?? signedProductImageUrl ?? undefined}
                        alt="Product preview"
                        className="h-16 w-16 rounded-lg object-cover border border-white/10 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{productImageFileName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Image ready — will be used with Wan &amp; Kling models</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors flex-shrink-0"
                        title="Remove image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                    >
                      <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-primary/30 transition-colors">
                        <ImagePlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">Upload product image</p>
                        <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WebP — up to 10 MB. Enables image-to-video conditioning on Wan &amp; Kling.</p>
                      </div>
                    </button>
                  )}

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
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
                    <Select value={platform} onValueChange={handlePlatformChange}>
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
                        <SelectItem value="5s">5 Seconds</SelectItem>
                        <SelectItem value="10s">10 Seconds</SelectItem>
                        <SelectItem value="15s">15 Seconds</SelectItem>
                        <SelectItem value="30s">30 Seconds</SelectItem>
                        <SelectItem value="45s">45 Seconds</SelectItem>
                        <SelectItem value="60s">60 Seconds</SelectItem>
                        <SelectItem value="90s">90 Seconds</SelectItem>
                        <SelectItem value="120s">120 Seconds</SelectItem>
                        <SelectItem value="180s">180 Seconds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full h-16 rounded-2xl bg-gradient-to-r from-violet-600 to-[#5B7CFA] text-lg font-bold shadow-[0_18px_45px_rgba(76,29,149,.35)] hover:from-violet-500 hover:to-indigo-400 hover:shadow-[0_22px_55px_rgba(76,29,149,.45)] transition-all"
                  onClick={handleExpand}
                  disabled={expandMutation.isPending}
                >
                  {expandMutation.isPending ? <Spinner className="mr-2 h-5 w-5" /> : <Sparkles className="mr-2 h-5 w-5" />}
                  {expandMutation.isPending ? "Writing cinematic script…" : "Generate Script with AI"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 — Script Review & Edit */}
          {step === 2 && expandedScript && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-white mb-2">{campaignHandoff ? "Approved Script Ready for Production" : "Cinematic Script Generated"}</h2>
                  <p className="text-muted-foreground">{campaignHandoff ? "The approved campaign copy is the source of truth. Any changes here are creative edits and do not change the campaign approval or history." : "Fine-tune any scene or the hook — your edits carry forward to the render."}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (scriptEdited) {
                      const confirmed = window.confirm("Go back and lose your edits?");
                      if (!confirmed) return;
                      setExpandedScript(null);
                      setScriptEdited(false);
                    }
                    setStep(1);
                  }}
                >Back</Button>
              </div>

              <Card className="border-primary/20 bg-primary/5">
                {/* Hook — editable */}
                <div className="p-6 border-b border-primary/10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-xs font-bold text-primary uppercase tracking-wider">The Hook</div>
                    <Pencil className="h-3 w-3 text-primary/60" />
                  </div>
                  <Textarea
                    value={expandedScript.hook}
                    onChange={(e) => updateHook(e.target.value)}
                    className="text-lg font-medium italic bg-black/20 border-white/10 focus:border-primary/50 resize-none min-h-[60px] leading-relaxed"
                    rows={2}
                  />
                </div>

                {/* Scenes — editable */}
                <div className="p-0">
                  {expandedScript.scenes.map((scene, idx) => {
                    const isRegenerating = regeneratingIdx === idx;
                    const isHintOpen = showHintFor === idx;
                    return (
                    <div key={idx} className="flex border-b border-primary/10 last:border-0">
                      <div className="w-16 flex-shrink-0 flex items-center justify-center border-r border-primary/10 bg-black/20 font-mono text-muted-foreground text-sm">
                        {scene.duration}
                      </div>
                      <div className="p-4 flex-1 space-y-3">
                        {/* Scene header row */}
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-white">Scene {scene.sceneNumber}</div>
                          <div className="flex items-center gap-1">
                            {/* Undo button — visible only after a successful regeneration */}
                            {sceneHistory[idx] && !isRegenerating && (
                              <button
                                type="button"
                                onClick={() => {
                                  const prev = sceneHistory[idx];
                                  setExpandedScript(s => {
                                    if (!s) return s;
                                    const scenes = s.scenes.map((sc, i) =>
                                      i === idx ? { ...sc, description: prev.description, visualDirection: prev.visualDirection } : sc
                                    );
                                    return { ...s, scenes };
                                  });
                                  setSceneHistory(h => { const next = { ...h }; delete next[idx]; return next; });
                                  setScriptEdited(true);
                                }}
                                title="Undo regeneration — restore previous version"
                                className="flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-300 transition-colors px-2 py-1 rounded-lg hover:bg-amber-400/10"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Undo</span>
                              </button>
                            )}
                            {/* Regenerate button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (isHintOpen) {
                                  setShowHintFor(null);
                                } else {
                                  setShowHintFor(idx);
                                }
                              }}
                              disabled={!!campaignHandoff || isRegenerating || regeneratingIdx !== null}
                              title={campaignHandoff ? "AI rewriting is disabled to protect approved campaign copy" : "Regenerate this scene with AI"}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {isRegenerating
                                ? <Spinner className="h-3 w-3" />
                                : <Wand2 className="h-3 w-3" />
                              }
                              <span>{campaignHandoff ? "Copy protected" : isRegenerating ? "Regenerating…" : "Regenerate"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Inline hint input */}
                        {isHintOpen && (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                            <Input
                              placeholder="Optional: nudge the AI (e.g. 'make it more dramatic')"
                              className="h-8 text-xs bg-transparent border-white/10 focus:border-primary/40 flex-1"
                              value={sceneHints[idx] ?? ""}
                              onChange={(e) => setSceneHints(prev => ({ ...prev, [idx]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") handleRegenerateScene(idx); }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={() => handleRegenerateScene(idx)}
                              disabled={isRegenerating}
                            >
                              <Wand2 className="h-3 w-3 mr-1" />
                              Go
                            </Button>
                            <button
                              type="button"
                              onClick={() => setShowHintFor(null)}
                              className="p-1 text-muted-foreground hover:text-white transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Scene description */}
                        <div className={isRegenerating ? "opacity-40 pointer-events-none" : ""}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                            <Pencil className="h-2.5 w-2.5 text-muted-foreground/60" />
                          </div>
                          <Textarea
                            value={scene.description}
                            onChange={(e) => updateScene(idx, "description", e.target.value)}
                            className="text-sm bg-black/20 border-white/10 focus:border-primary/50 resize-none min-h-[56px]"
                            rows={2}
                          />
                        </div>

                        {/* Visual direction */}
                        <div className={isRegenerating ? "opacity-40 pointer-events-none" : ""}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Film className="h-3 w-3 text-primary" />
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Visual Direction</span>
                            <Pencil className="h-2.5 w-2.5 text-primary/60" />
                          </div>
                          <Textarea
                            value={scene.visualDirection}
                            onChange={(e) => updateScene(idx, "visualDirection", e.target.value)}
                            className="text-sm bg-black/40 border-white/10 focus:border-primary/50 resize-none min-h-[56px] text-white/80"
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </Card>

              {/* Voiceover — editable */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Voiceover</div>
                  <Pencil className="h-3 w-3 text-muted-foreground/60" />
                </div>
                <Textarea
                  value={expandedScript.voiceoverText}
                  onChange={(e) => updateVoiceover(e.target.value)}
                  className="text-sm leading-relaxed bg-transparent border-white/10 focus:border-primary/50 resize-none min-h-[80px]"
                  rows={4}
                />
              </div>

              <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={() => setStep(3)}>
                Script Ready — Choose Model <ChevronRight className="ml-2 h-5 w-5" />
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
                  <strong className="text-amber-400">AI video models generate short clips</strong> — output length is capped by the model, not your script duration.
                  LTX outputs up to 5 sec, Ovi &amp; Wan up to 10 sec, Kling up to 10 sec, Veo 3 up to 8 sec. For longer ads, combine multiple renders.
                </span>
              </div>

              {/* Image conditioning notice */}
              {productImageUrl && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-white/70 flex items-start gap-2">
                  <ImagePlus className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>
                    <strong className="text-white">Product image attached.</strong> Select <span className="text-primary font-medium">Wan</span> or <span className="text-primary font-medium">Kling</span> to use image conditioning — your product image will be used as the reference frame. Ovi is text-only and will ignore the image.
                  </span>
                </div>
              )}

              {!productImageUrl && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/50 flex items-start gap-2">
                  <Info className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>
                    No product image attached. <button type="button" onClick={() => setStep(1)} className="text-primary hover:underline">Go back to add one</button> — Wan &amp; Kling can use your product image as a reference for more accurate video output.
                  </span>
                </div>
              )}

              {modelsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(models ?? []).map((model) => {
                    const isSelected = modelId === model.id;
                    const canUse = canUseModel(model.tier);
                    const clipLen = clipLabel(model.id, duration);
                    const supportsImage = Boolean((model as any).capabilities?.includes("Image conditioning"));
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
                          {supportsImage && productImageUrl && (
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold">
                              IMG
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{model.description}</p>
                        {/* Image conditioning badge */}
                        {supportsImage ? (
                          <div className="mb-2 text-xs text-primary/80 flex items-center gap-1">
                            <ImagePlus className="h-3 w-3" />
                            <span>Supports image conditioning</span>
                          </div>
                        ) : (
                          <div className="mb-2 text-xs text-slate-400 flex items-center gap-1">
                            <span>Text-only — image not used</span>
                          </div>
                        )}
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
                    {productImageUrl && selectedModelSupportsImage && (
                      <span className="ml-2 text-xs text-primary">+ image conditioning</span>
                    )}
                    {productImageUrl && !selectedModelSupportsImage && (
                      <span className="ml-2 text-xs text-amber-400">image not used by this model</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-white font-bold">{(selectedModel as any).creditCost ?? 30}</span>
                    <span className="text-muted-foreground">/ {userCredits} credits remaining</span>
                  </div>
                </div>
              )}

              {/* Voice picker */}
              {(() => {
                const voices: { id: string; label: string; description: string }[] = [
                  { id: "alloy", label: "Alloy", description: "Neutral & clear" },
                  { id: "echo", label: "Echo", description: "Warm & deep" },
                  { id: "fable", label: "Fable", description: "Expressive & storytelling" },
                  { id: "onyx", label: "Onyx", description: "Rich & authoritative" },
                  { id: "nova", label: "Nova", description: "Energetic & bright" },
                  { id: "shimmer", label: "Shimmer", description: "Soft & friendly" },
                ];
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Narrator Voice</span>
                      <span className="text-xs text-muted-foreground">— choose the voice for your ad's voiceover</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {voices.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVoiceId(v.id)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            voiceId === v.id
                              ? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
                              : "border-border bg-card hover:border-white/20 hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {voiceId === v.id && <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                            <span className={`text-sm font-semibold ${voiceId === v.id ? "text-primary" : "text-white"}`}>{v.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{v.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={() => setStep(4)} disabled={!modelId}>
                Confirm Model <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* STEP 4 — Storyboard Preview & Confirm */}
          {step === 4 && expandedScript && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Preview Before You Render</h2>
                  <p className="text-muted-foreground">Here's exactly what you're getting. Confirm when ready.</p>
                </div>
                <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              </div>

              {/* Honest clip-length banner */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">🎬</span>
                <div className="space-y-1">
                  <p className="font-semibold text-white">You'll receive a <span className="text-amber-300">{clipLabel(modelId, duration)}</span> AI-generated clip</p>
                  {parseDurationSec(duration) > (MODEL_MAX_SECONDS[modelId] ?? 10) ? (
                    <p className="text-sm text-amber-400/80">
                      You selected <strong className="text-amber-300">{duration}</strong> but <strong className="text-amber-300">{selectedModel?.name ?? modelId}</strong> outputs at most{" "}
                      <strong className="text-amber-300">{nativeDurationSeconds} sec</strong>. Quae will send a purpose-built short production brief—not the full storyboard—to this model.
                    </p>
                  ) : (
                    <p className="text-sm text-amber-400/80">
                      This model can execute the approved creative at its requested duration, so Quae will preserve the full production direction.
                    </p>
                  )}
                </div>
              </div>

              {previewRenderBrief?.shortened && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-emerald-400/20 bg-emerald-400/5 p-5">
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-300">Approved Campaign</p>
                    <p className="mt-2 font-semibold text-white">{parseDurationSec(duration)}-second approved campaign</p>
                    <p className="mt-2 text-xs text-white/60">Your approved campaign and full script remain unchanged.</p>
                  </Card>
                  <Card className="border-violet-400/30 bg-violet-400/10 p-5">
                    <p className="text-xs font-black uppercase tracking-wider text-violet-300">{modelId === "ltx-fast" ? "Fast Draft" : "Model Render Brief"}</p>
                    <p className="mt-2 font-semibold text-white">~{previewRenderBrief.renderDurationSeconds}-second concept preview</p>
                    <p className="mt-2 text-xs text-white/70">Quae created a {previewRenderBrief.renderDurationSeconds}-second production brief from your approved campaign for this model. Your full approved campaign remains unchanged.</p>
                  </Card>
                  <Card className="p-5 md:col-span-2">
                    <p className="text-xs font-black uppercase tracking-wider text-violet-300">Visual Production Brief</p>
                    <p className="mt-3 text-sm text-white">{previewRenderBrief.visualProductionBrief}</p>
                    {productImageUrl && selectedModelSupportsImage && (
                      <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
                        <p className="text-xs font-black uppercase tracking-wider text-emerald-300">Product Reference</p>
                        <p className="mt-1 text-sm text-white">Your saved product image will guide this render.</p>
                      </div>
                    )}
                    {previewRenderBrief.visualBeats.map((beat, index) => <p key={index} className="mt-3 text-sm text-white"><strong>Visual {index + 1}:</strong> {beat}</p>)}
                    <p className="mt-3 text-sm text-white"><strong>Approved message:</strong> {previewRenderBrief.marketingMessage}</p>
                    <p className="mt-3 text-sm text-white/80"><strong>Short voiceover:</strong> {previewRenderBrief.voiceoverText || "No narration"}</p>
                    <p className="mt-3 text-xs text-white/50">Exact captions, price text, CTA, and branding are excluded from AI-generated pixels to prevent unreadable text.</p>
                  </Card>
                </div>
              )}

              {/* Approved storyboard */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Film className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{previewRenderBrief?.shortened ? "Approved Campaign Storyboard (unchanged)" : "Storyboard"}</h3>
                </div>
                <div className="space-y-3">
                  {expandedScript.scenes.map((scene, idx) => (
                    <div key={idx} className="flex gap-3 p-4 rounded-xl border border-border bg-card/50">
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                          {scene.sceneNumber}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{scene.duration}</span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm text-white leading-relaxed">{scene.description}</p>
                        <div className="flex items-start gap-1.5">
                          <Film className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-white/50 italic leading-relaxed">{scene.visualDirection}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Opening hook */}
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Opening Hook</div>
                <p className="text-base italic text-white leading-relaxed">"{expandedScript.hook}"</p>
              </div>

              {/* Voiceover text */}
              <div className="p-4 rounded-xl border border-border bg-card/50">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Voiceover Script</div>
                <p className="text-sm text-white/80 leading-relaxed">{expandedScript.voiceoverText}</p>
                {expandedScript.callToAction && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Call to Action — </span>
                    <span className="text-xs text-white/70">{expandedScript.callToAction}</span>
                  </div>
                )}
              </div>

              {/* Model example output */}
              {(() => {
                const modelExamples: Record<string, { label: string; description: string; videoUrl?: string }> = {
                  "ltx-fast": {
                    label: "Fast Draft — LTX Fast",
                    description: "Renders in ~30 seconds using LTX 2.3 Fast. Stylized clips up to 5 sec — ideal for rapid concept drafts before committing to a premium render.",
                  },
                  ltx: {
                    label: "LTX Video",
                    description: "Fast, stylized clips up to 5 sec. Great for concept visualization with a dreamlike quality.",
                  },
                  ovi: {
                    label: "Ovi",
                    description: "Smooth, cinematic clips up to 10 sec with native audio. Best all-rounder for product ads.",
                  },
                  wan: {
                    label: "Wan 2.5",
                    description: "Fluid clips up to 10 sec with excellent motion. Supports image conditioning for product-accurate frames.",
                  },
                  kling: {
                    label: "Kling 2.5",
                    description: "Cinematic clips up to 10 sec with high detail and realistic movement. May queue at peak hours — use Wan 2.5 for reliability.",
                  },
                  "kling-1.6": {
                    label: "Kling 1.6",
                    description: "Cinematic clips up to 10 sec with high detail and realistic movement. May queue at peak hours — use Wan 2.5 for reliability.",
                  },
                  veo3: {
                    label: "Veo 3",
                    description: "Google's flagship model — clips up to 8 sec with exceptional realism and production quality.",
                  },
                };
                const example = modelExamples[modelId] ?? modelExamples.ovi;
                return (
                  <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">What {example.label} output looks like</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {example.videoUrl ? (
                        <video
                          src={example.videoUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full rounded-lg aspect-video bg-black"
                        />
                      ) : (
                        <div className="w-full rounded-lg aspect-video bg-black/40 border border-white/10 flex flex-col items-center justify-center gap-3 text-center px-8">
                          <Film className="h-10 w-10 text-white/20" />
                          <div>
                            <p className="text-sm font-medium text-white/50">Example clip not yet available</p>
                            <p className="text-xs text-slate-400 mt-1">Your render will appear here when complete</p>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-white/60 leading-relaxed">{example.description}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Image conditioning notice */}
              {productImageUrl && selectedModelSupportsImage && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-primary">
                  <ImagePlus className="h-4 w-4 flex-shrink-0" />
                  <span>Your product image will be used as a reference frame for more accurate output</span>
                </div>
              )}
              {productImageUrl && !selectedModelSupportsImage && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-amber-400">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  <span>{selectedModel?.name ?? "This model"} is text-only — your product image won't be used in the render</span>
                </div>
              )}

              {/* Cost summary + CTA */}
              {(() => {
                const renderCost = (selectedModel as any)?.creditCost ?? 30;
                const afterBalance = userCredits - renderCost;
                const needsConfirm = renderCost >= CONFIRM_CREDIT_THRESHOLD;
                return (
                  <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="space-y-0.5">
                        <p className="text-sm text-muted-foreground">
                          Model: <span className="text-white font-semibold">{selectedModel?.name ?? "Ovi"}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Cost: <span className={`font-bold ${isAdminUser ? "text-green-400" : "text-amber-400"}`}>{isAdminUser ? "FREE (admin)" : `${renderCost} credits`}</span>
                          {!isAdminUser && <span className="text-muted-foreground"> ({userCredits} remaining → {Math.max(0, afterBalance)} after)</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                        <Zap className="h-3 w-3 text-primary" />
                        <span>Credits deducted when render starts</span>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" size="lg" onClick={() => setStep(3)} className="flex-shrink-0">
                        Back
                      </Button>
                      <Button
                        size="lg"
                        onClick={() => {
                          if (needsConfirm) {
                            setShowRenderConfirm(true);
                          } else {
                            void handleSaveProject();
                          }
                        }}
                        disabled={createMutation.isPending}
                        className="flex-1 font-bold shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
                      >
                        {createMutation.isPending ? (
                          <><Spinner className="mr-2" /> Submitting…</>
                        ) : (
                          <><Download className="mr-2 h-5 w-5" /> Confirm &amp; Start Render</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </div>

      {/* Credit confirmation dialog — shown for high-cost models */}
      {step === 4 && selectedModel && (() => {
        const renderCost = (selectedModel as any)?.creditCost ?? 30;
        const afterBalance = userCredits - renderCost;
        return (
          <Dialog open={showRenderConfirm} onOpenChange={setShowRenderConfirm}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-400" />
                  Confirm Render
                </DialogTitle>
                <DialogDescription>
                  Review the credit cost before starting your render.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Model row */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <span className="text-sm text-muted-foreground">Model</span>
                  <span className="text-sm font-semibold text-white">{selectedModel.name}</span>
                </div>

                {/* Cost row */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <span className="text-sm text-muted-foreground">Render cost</span>
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-amber-400" />
                    {isAdminUser
                      ? <span className="text-base font-black text-green-400">FREE (admin)</span>
                      : <><span className="text-base font-black text-amber-400">{renderCost}</span><span className="text-sm text-muted-foreground">credits</span></>}
                  </div>
                </div>

                {/* Balance rows — hidden for admin since they're never charged */}
                {!isAdminUser && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Your balance</span>
                      <span className="font-semibold text-white">{userCredits} credits</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-sm border-t border-white/10">
                      <span className="text-muted-foreground">Balance after render</span>
                      <span className={`font-semibold ${afterBalance < 0 ? "text-red-400" : "text-white"}`}>
                        {Math.max(0, afterBalance)} credits
                      </span>
                    </div>
                  </div>
                )}

                {!isAdminUser && afterBalance < 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    <span className="flex-shrink-0 mt-0.5">⚠</span>
                    <span>You don't have enough credits for this render. Please top up your plan first.</span>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setShowRenderConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setShowRenderConfirm(false);
                    void handleSaveProject();
                  }}
                  disabled={createMutation.isPending || (!isAdminUser && afterBalance < 0)}
                  className="font-bold"
                >
                  {createMutation.isPending ? (
                    <><Spinner className="mr-2" /> Submitting…</>
                  ) : (
                    <><Download className="mr-2 h-4 w-4" /> Confirm &amp; Render</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
