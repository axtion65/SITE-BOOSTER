import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { RequireAuth } from "@/components/auth-guard";
import { useExpandPrompt, useCreateProject, useRegenerateScene } from "@workspace/api-client-react";
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
import { approvedCampaignToStudio, campaignVideoIdempotencyKey, preparedVideoBriefToStudio, shouldRestoreStudioDraft, type ApprovedCampaignHandoff } from "@/lib/campaign-handoff";
import { compilePreviewRenderBrief } from "@/lib/render-brief";
import { loadMockupVideoHandoff } from "@/lib/mockup-handoff";
import { MarketingImage } from "./marketing-shared";
import { getProductionCreditCost, normalizeClipLength, RENDERING_MODEL_BY_ID, type RenderIntent } from "@workspace/plans";
import { buildStudioProjectRequest } from "@/lib/studio-project-request";

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
    // Quae owns provider selection. Migrate every customer draft to the
    // production default instead of restoring the retired model-picker step.
    parsed.modelId = "ltx-fast";
    if (parsed.step === 3) parsed.step = 4;
    parsed.duration = normalizeClipLength("ltx-fast", parsed.duration);
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
  const searchParams = new URLSearchParams(search);
  const campaignId = searchParams.get("campaignId")?.trim() || null;
  const briefId = searchParams.get("briefId")?.trim() || null;
  const approvedMockup = searchParams.get("source") === "approved-mockup" ? loadMockupVideoHandoff() : null;

  // Load saved draft once (before state initialisation)
  const savedDraft = approvedMockup ? null : shouldRestoreStudioDraft(search) ? loadDraft() : null;

  const [step, setStep] = useState(savedDraft?.step ?? 1);
  const [modelId, setModelId] = useState<string>("ltx-fast");
  const [voiceId, setVoiceId] = useState<string>(savedDraft?.voiceId ?? "alloy");

  // Step 1 State
  const [productName, setProductName] = useState(approvedMockup?.product?.name ?? savedDraft?.productName ?? "");
  const [description, setDescription] = useState(approvedMockup?.product?.description ?? savedDraft?.description ?? "");
  const [targetAudience, setTargetAudience] = useState(savedDraft?.targetAudience ?? "");
  const [platform, setPlatform] = useState(savedDraft?.platform ?? "tiktok");
  const [duration, setDuration] = useState(() => normalizeClipLength(approvedMockup?.renderingModelId ?? savedDraft?.modelId ?? "ltx-fast", savedDraft?.duration));

  // Product image state
  // productImageUrl: GCS serving URL stored in DB and draft (short path, no bloat)
  // Visuals are deliberately session-scoped: a saved/stale draft may never opt a
  // later render into image-to-video.
  const [productImageUrl, setProductImageUrl] = useState<string | null>(approvedMockup ? `/api/storage${approvedMockup.authoritativeImagePath}` : null);
  const [campaignProductImageUrl, setCampaignProductImageUrl] = useState<string | null>(null);
  const [campaignVisualIdentity, setCampaignVisualIdentity] = useState<{ projectId: string; versionId: string } | null>(null);
  const [renderIntent, setRenderIntent] = useState<RenderIntent>("create_new");
  // imagePreviewUrl: local data URL for thumbnail display only — NOT persisted in draft
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  // signedProductImageUrl: short-lived GCS signed URL resolved from productImageUrl
  const signedProductImageUrl = usePrivateImageUrl(productImageUrl);
  const [productImageFileName, setProductImageFileName] = useState<string | null>(approvedMockup ? "Approved Quae visual" : savedDraft?.productImageFileName ?? null);
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
  const [visualOptions,setVisualOptions]=useState<any[]>([]),[selectedVisualIds,setSelectedVisualIds]=useState<string[]>([]),[approvedRunId,setApprovedRunId]=useState<string>("");

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

  // Provider choice is an internal production detail. Keep the legacy picker
  // implementation isolated for old code paths, but expose only the automatic
  // LTX production profile to new customer work.
  const models = [RENDERING_MODEL_BY_ID["ltx-fast"]];
  const modelsLoading = false;
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
      setCampaignHandoff(null);
      setCampaignProductImageUrl(null);
      setCampaignVisualIdentity(null);
      try {
        const token = localStorage.getItem("quae_token") || "";
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("missing");
        const campaign=await response.json();
        const optionsResponse=await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/visual-options`,{headers:{Authorization:`Bearer ${token}`}});
        if(optionsResponse.ok)setVisualOptions(await optionsResponse.json());
        const attached=campaign.attachedVisuals||[];const primary=attached.find((v:any)=>v.is_primary);setSelectedVisualIds(primary?[primary.version_id,...attached.filter((v:any)=>v.version_id!==primary.version_id).map((v:any)=>v.version_id)]:attached.map((v:any)=>v.version_id));setApprovedRunId(campaign.approved_run_id||"");if(primary){const primaryUrl=`/api/storage${primary.object_path}`;setProductImageUrl(primaryUrl);setCampaignProductImageUrl(primaryUrl);setCampaignVisualIdentity({projectId:String(primary.project_id),versionId:String(primary.version_id)});setProductImageFileName(`${primary.name} · Version ${primary.version_number}`);setRenderIntent("animate");setCampaignMessage(briefId?"Animate Existing · Confirmed campaign visual loaded. No generation starts until you explicitly continue.":"Animate Existing · Quae will prepare this confirmed campaign visual when you start the render.");}
        let handoff: ApprovedCampaignHandoff | null = null;
        if (briefId) {
          const briefResponse = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/video-brief?briefId=${encodeURIComponent(briefId)}`,{headers:{Authorization:`Bearer ${token}`}});
          if (!briefResponse.ok) throw new Error("stale-video-brief");
          const preparedBrief = await briefResponse.json();
          handoff = preparedVideoBriefToStudio(preparedBrief,{briefId,campaignId,approvedRunId:String(campaign.approved_run_id||""),selectedVisualProjectId:String(primary?.project_id||""),selectedVisualVersionId:String(primary?.version_id||"")});
          if (!handoff) throw new Error("stale-video-brief");
        } else {
          handoff = approvedCampaignToStudio(campaign);
        }
        if (!handoff) {
          const context=campaign.context_snapshot?.generationContext??campaign.context_snapshot??{};
          if(!cancelled){setProductName(context.products?.[0]?.name||context.identity?.name||campaign.name);setDescription(context.products?.[0]?.description||context.identity?.description||campaign.brief?.objective||"");setTargetAudience(context.audienceEvidence||"");setCampaignMessage("This campaign’s brief, website evidence, and visuals are loaded. Complete the Describe step to continue.");}
          return;
        }
        if (cancelled) return;
        setCampaignHandoff(handoff);
        setProductName(handoff.productName);
        setDescription(handoff.description);
        setTargetAudience(handoff.targetAudience);
        setPlatform(handoff.platform);
        setDuration(normalizeClipLength(modelId, handoff.duration));
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
  }, [campaignId, briefId]);

  async function saveVisualSelection(ids:string[]){if(!campaignId||!approvedRunId||!ids.length)return;const token=localStorage.getItem("quae_token")||"";const response=await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/asset-selection`,{method:"PUT",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({approvedRunId,versionId:ids[0]})});if(!response.ok){toast({title:"That visual could not be attached",variant:"destructive"});return;}setSelectedVisualIds([ids[0]]);const selected=visualOptions.find(v=>v.version_id===ids[0]);if(selected){const selectedUrl=`/api/storage${selected.object_path}`;setProductImageUrl(selectedUrl);setCampaignProductImageUrl(selectedUrl);setCampaignVisualIdentity({projectId:String(selected.project_id),versionId:String(selected.version_id)});setProductImageFileName(`${selected.name} · Version ${selected.version_number}`);setRenderIntent("animate");}}

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
      if (tDuration) setDuration(normalizeClipLength(modelId, tDuration));
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
    setModelId("ltx-fast");
    setProductName("");
    setDescription("");
    setTargetAudience("");
    setPlatform("tiktok");
    setDuration(normalizeClipLength("ltx-fast"));
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
    if (campaignId) {
      toast({ title: "Use a confirmed campaign visual", description: "Choose the campaign visual below so the render stays attached to the approved campaign.", variant: "destructive" });
      return;
    }
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
      if (RENDERING_MODEL_BY_ID[modelId]?.supports.imageToVideo) setRenderIntent("animate");
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
    setRenderIntent("create_new");
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
      const canonicalDuration = normalizeClipLength(modelId, duration);
      const submissionRenderIntent: RenderIntent = renderIntent;
      let submissionBriefId = briefId;
      let submissionHandoff = campaignHandoff;
      if (campaignId && submissionRenderIntent === "animate" && !submissionBriefId) {
        if (!approvedRunId || !campaignVisualIdentity || !campaignProductImageUrl) throw new Error("Confirm an owned campaign visual before rendering.");
        const token = localStorage.getItem("quae_token") || "";
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/video-brief`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
        const preparedBrief = await response.json();
        if (!response.ok) throw new Error(preparedBrief.error || "Could not prepare the confirmed campaign visual.");
        submissionBriefId = String(preparedBrief.id || "");
        submissionHandoff = preparedVideoBriefToStudio(preparedBrief, { briefId: submissionBriefId, campaignId, approvedRunId, selectedVisualProjectId: campaignVisualIdentity.projectId, selectedVisualVersionId: campaignVisualIdentity.versionId });
        if (!submissionBriefId || !submissionHandoff) throw new Error("The prepared campaign video did not match the confirmed visual.");
      }
      const campaignIdempotencyKey=campaignVideoIdempotencyKey({campaignId,approvedRunId,briefId:submissionBriefId,renderIntent:submissionRenderIntent,modelId,duration:canonicalDuration});
      const res = await createMutation.mutateAsync({
        data: buildStudioProjectRequest({
          campaignId,
          campaignVideoBriefId: submissionBriefId,
          idempotencyKey: campaignIdempotencyKey ?? crypto.randomUUID(),
          productName,
          description,
          modelId,
          expandedScript: submissionHandoff?.expandedScript ?? expandedScript,
          platform: submissionHandoff?.platform ?? platform,
          duration: canonicalDuration,
          templateId,
          renderIntent: submissionRenderIntent,
          productImageUrl: campaignId ? campaignProductImageUrl : productImageUrl,
          voiceId,
        })
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

  const selectedModel = RENDERING_MODEL_BY_ID["ltx-fast"];
  const userCredits = (user as any)?.credits ?? 0;
  const userPlan = (user as any)?.plan ?? "free";
  const isAdminUser = (user as any)?.isAdmin === true;

  // Parse "15s" → 15, "30s" → 30, "1m" → 60
  function parseDurationSec(d: string): number {
    const s = d.toLowerCase().trim();
    if (s.endsWith("m")) return parseInt(s) * 60;
    if (s.endsWith("s")) return parseInt(s);
    return parseInt(s) || 10;
  }

  function clipLabel(mId: string): string {
    void mId;
    return `${parseDurationSec(duration)}-second complete advert`;
  }

  const planTierOrder = { free: 0, starter: 1, pro: 2, agency: 3 };

  // Admins bypass all tier restrictions so they can test every model
  function canUseModel(_modelTier: string) {
    if (isAdminUser) return true;
    const tier = _modelTier;
    return (planTierOrder[tier as keyof typeof planTierOrder] ?? 0) <= (planTierOrder[userPlan as keyof typeof planTierOrder] ?? 0);
  }

  // Whether the selected model supports image conditioning
  const selectedModelSupportsImage = RENDERING_MODEL_BY_ID[modelId]?.supports.imageToVideo === true;
  const canAnimateSelectedVisual = selectedModelSupportsImage && Boolean(productImageUrl) && (!campaignId || Boolean(campaignVisualIdentity));

  const nativeDurationSeconds = RENDERING_MODEL_BY_ID[modelId]?.nativeDurationSeconds ?? 10;
  const previewRenderBrief = expandedScript
    ? compilePreviewRenderBrief(expandedScript, parseDurationSec(duration), nativeDurationSeconds)
    : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0D1728] relative overflow-hidden before:pointer-events-none before:absolute before:-left-40 before:top-10 before:h-96 before:w-96 before:rounded-full before:bg-blue-500/10 before:blur-3xl">
      {/* Step progress header */}
      <div className="min-h-20 border-b border-white/[.07] flex items-center justify-between gap-4 overflow-x-auto px-5 sm:px-8 bg-[#18263D]/95 shadow-xl z-10">
        <div className="flex shrink-0 items-center gap-4 text-sm text-[#8494AC] font-semibold">
          {([{ step: 1, label: "Describe" }, { step: 2, label: "AI Script" }, { step: 4, label: "Review & Render" }]).map((item, i) => (
            <div key={item.step} className="flex items-center gap-4">
              {i > 0 && <ChevronRight className="h-4 w-4" />}
              <span className={step >= item.step ? "text-primary font-semibold" : ""}>{i + 1}. {item.label}</span>
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

                  {/* Product image upload and owned My Visuals selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>
                      Product Image{" "}
                      <span className="text-muted-foreground font-normal text-xs ml-1">optional</span>
                    </Label>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Info className="h-3 w-3" />
                      <span>Helps Quae create product-accurate scenes</span>
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
                        <p className="text-xs text-muted-foreground mt-0.5">Image ready — available to the full scene production plan</p>
                      </div>
                      {!campaignId && <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors flex-shrink-0"
                        title="Remove image"
                      >
                        <X className="h-4 w-4" />
                      </button>}
                    </div>
                  ) : campaignId ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-muted-foreground">
                      Choose an owned campaign visual below. New uploads must be added through My Visuals before they can become the confirmed campaign source.
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
                        <p className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">Upload new visual</p>
                        <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WebP — up to 10 MB. Helps Quae create accurate scenes.</p>
                      </div>
                    </button>
                  )}
                  {campaignId&&<div className="mt-4 rounded-xl border border-white/10 p-4"><p className="text-sm font-bold">Choose from My Visuals</p><p className="mt-1 text-xs text-muted-foreground">Choose one primary visual and optional additional campaign visuals. Originals stay in My Visuals.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{visualOptions.map((visual:any)=>{const selected=selectedVisualIds.includes(visual.version_id);return <button type="button" key={visual.version_id} onClick={()=>{const ids=selected?selectedVisualIds.filter(id=>id!==visual.version_id):[...selectedVisualIds,visual.version_id];if(ids.length)void saveVisualSelection(ids)}} className={`overflow-hidden rounded-lg border text-left text-xs ${selected?"border-violet-400 bg-violet-500/10":"border-white/10"}`}><MarketingImage objectPath={visual.object_path} alt={visual.name} className="aspect-video w-full object-cover"/><div className="p-3"><b className="block text-sm">{visual.name}</b><span>Status: {String(visual.status).replaceAll("_"," ")} · Version {visual.version_number}</span><span className="block mt-1">Created {new Date(visual.created_at).toLocaleDateString()}</span><span className="mt-2 block font-bold text-violet-200">{selected?(selectedVisualIds[0]===visual.version_id?"Primary visual":"Additional visual"):"Attach visual"}</span></div></button>})}{visualOptions.length===0&&<p className="text-xs text-muted-foreground">No selectable saved visuals yet.</p>}</div></div>}

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
                    <Label>Advert length</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger aria-label="Advert length" className="border-white/20 bg-[#111C30] text-white focus:ring-violet-400"><SelectValue /></SelectTrigger>
                      <SelectContent sideOffset={8} className="border-white/20 bg-[#111C30] text-white shadow-2xl">
                        <SelectItem className="text-white focus:bg-violet-600 focus:text-white data-[state=checked]:bg-violet-700" value="15s">15 seconds</SelectItem>
                        <SelectItem className="text-white focus:bg-violet-600 focus:text-white data-[state=checked]:bg-violet-700" value="30s">30 seconds — recommended</SelectItem>
                        <SelectItem className="text-white focus:bg-violet-600 focus:text-white data-[state=checked]:bg-violet-700" value="45s">45 seconds</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-white/65">Quae builds several script-matched scenes, then assembles the exact-length advert with voiceover, captions, branding, and CTA.</p>
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
                  <p className="text-muted-foreground">{campaignHandoff ? "The approved campaign copy is locked as the production source of truth." : "Fine-tune any scene or the hook — your edits carry forward to the render."}</p>
                </div>
                {!campaignHandoff && <Button
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
                >Back</Button>}
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
                    readOnly={Boolean(campaignHandoff)}
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
                            readOnly={Boolean(campaignHandoff)}
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
                            readOnly={Boolean(campaignHandoff)}
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
                  readOnly={Boolean(campaignHandoff)}
                  onChange={(e) => updateVoiceover(e.target.value)}
                  className="text-sm leading-relaxed bg-transparent border-white/10 focus:border-primary/50 resize-none min-h-[80px]"
                  rows={4}
                />
              </div>

              <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={() => setStep(4)}>
                Script Ready — Review Video <ChevronRight className="ml-2 h-5 w-5" />
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

              <div className="grid gap-3 md:grid-cols-2" aria-label="Render intent">
                <button type="button" onClick={() => setRenderIntent("create_new")} className={`rounded-xl border p-4 text-left ${renderIntent === "create_new" ? "border-primary bg-primary/10" : "border-white/10"}`}>
                  <strong className="block text-white">Create a new AI video</strong>
                  <span className="text-xs text-muted-foreground">Builds each approved scene and uses owned business assets when available.</span>
                </button>
                <button type="button" disabled={!canAnimateSelectedVisual} onClick={() => canAnimateSelectedVisual && setRenderIntent("animate")} className={`rounded-xl border p-4 text-left disabled:opacity-40 ${renderIntent === "animate" ? "border-primary bg-primary/10" : "border-white/10"}`}>
                  <strong className="block text-white">Animate my selected visual</strong>
                  <span className="text-xs text-muted-foreground">Animates only the visual shown below with a supported model.</span>
                </button>
              </div>
              {campaignId && !briefId && productImageUrl && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 text-sm text-amber-300">
                  Quae will prepare the exact confirmed campaign visual before the render starts. No provider or credits are used during preparation.
                </div>
              )}

              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-300/90 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>
                  <strong className="text-emerald-300">Complete advert production</strong> — voiceover is measured first, every approved beat gets its own scene, and Quae assembles one exact 15, 30, or 45-second video.
                </span>
              </div>

              {/* Image conditioning notice */}
              {productImageUrl && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-white/70 flex items-start gap-2">
                  <ImagePlus className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>
                    <strong className="text-white">Product image attached.</strong> LTX 2.3 and Kling 3 can use it as the approved visual reference across the scene plan.
                  </span>
                </div>
              )}

              {!productImageUrl && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/50 flex items-start gap-2">
                  <Info className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>
                    No product image attached. <button type="button" onClick={() => setStep(1)} className="text-primary hover:underline">Go back to add one</button>, or Quae will use approved assets already saved to the business when available.
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
                    const clipLen = clipLabel(model.id);
                    const supportsImage = RENDERING_MODEL_BY_ID[model.id]?.supports.imageToVideo === true;
                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          if (!canUse) return;
                          setModelId(model.id);
                          setDuration(normalizeClipLength(model.id, duration));
                          if (renderIntent === "animate" && !RENDERING_MODEL_BY_ID[model.id]?.supports.imageToVideo) setRenderIntent("create_new");
                        }}
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
                        {/* Complete customer output length */}
                        <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/50">
                          Output: <span className="text-white font-bold">{clipLen}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Zap className="h-4 w-4 text-primary" />
                            <span className="font-black text-white text-lg">{getProductionCreditCost(model.id, duration)}</span>
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
                    {renderIntent === "animate" && productImageUrl && selectedModelSupportsImage && (
                      <span className="ml-2 text-xs text-primary">+ image conditioning</span>
                    )}
                    {productImageUrl && !selectedModelSupportsImage && (
                      <span className="ml-2 text-xs text-amber-400">image not used by this model</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-white font-bold">{getProductionCreditCost(selectedModel.id, duration)}</span>
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
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">🎬</span>
                <div className="space-y-1">
                  <p className="font-semibold text-white">You'll receive a <span className="text-emerald-300">{clipLabel(modelId)}</span> matched to the approved script</p>
                  <p className="text-sm text-emerald-300/80">Voiceover first, one generated shot per approved beat, then deterministic captions, brand end card, and exact-length assembly.</p>
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
                    <p className="text-xs font-black uppercase tracking-wider text-violet-300">Video Production Brief</p>
                    <p className="mt-2 font-semibold text-white">~{previewRenderBrief.renderDurationSeconds}-second concept preview</p>
                    <p className="mt-2 text-xs text-white/70">Quae created a {previewRenderBrief.renderDurationSeconds}-second production brief from your approved campaign. Your full approved campaign remains unchanged.</p>
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

              {/* Production example output */}
              {(() => {
                const modelExamples: Record<string, { label: string; description: string; videoUrl?: string }> = {
                  "ltx-fast": {
                    label: "Business Ad — LTX 2.3 Fast",
                    description: "Several fast, script-specific visual scenes assembled into one complete advert with measured voiceover, captions, branding, and CTA.",
                  },
                  kling: {
                    label: "Premium Ad — Kling 3",
                    description: "Higher-fidelity, script-specific scenes assembled into one complete advert with measured voiceover, captions, branding, and CTA.",
                  },
                };
                const example = modelExamples[modelId] ?? modelExamples["ltx-fast"]!;
                return (
                  <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">What your finished video will include</span>
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
                const renderCost = getProductionCreditCost(selectedModel?.id ?? modelId, duration);
                const afterBalance = userCredits - renderCost;
                const needsConfirm = true;
                return (
                  <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="space-y-0.5">
                        <p className="text-sm text-muted-foreground">
                          Production: <span className="text-white font-semibold">Complete AI advertisement</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Cost: <span className={`font-bold ${isAdminUser ? "text-green-400" : "text-amber-400"}`}>{isAdminUser ? "FREE (admin)" : `${renderCost} credits`}</span>
                          {!isAdminUser && <span className="text-muted-foreground"> ({userCredits} remaining → {Math.max(0, afterBalance)} after)</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">Mode: <span className="font-semibold text-white">{renderIntent === "animate" ? "Animate selected visual" : "Create a new AI video"}</span></p>
                        <p className="text-sm text-muted-foreground">Output length: <span className="font-semibold text-white">{clipLabel(modelId)}</span></p>
                        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                          Source:
                          {renderIntent === "animate" && (signedProductImageUrl || imagePreviewUrl) ? <img src={signedProductImageUrl || imagePreviewUrl || ""} alt="Selected render source" className="h-10 w-10 rounded object-cover" /> : <span className="font-semibold text-white">Approved scene brief (no image)</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                        <Zap className="h-3 w-3 text-primary" />
                        <span>Credits deducted when render starts</span>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" size="lg" onClick={() => setStep(2)} className="flex-shrink-0">
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
        const renderCost = getProductionCreditCost(selectedModel.id, duration);
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
                {campaignHandoff && <div className="space-y-2 rounded-xl border border-violet-400/20 bg-violet-500/5 p-3 text-sm">
                  <div><span className="text-muted-foreground">Business / product</span><p className="font-semibold text-white">{campaignHandoff.productName}</p></div>
                  <div><span className="text-muted-foreground">Campaign</span><p className="font-semibold text-white">{campaignHandoff.campaignName}</p></div>
                  <div><span className="text-muted-foreground">Approved script</span><p className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-white">{campaignHandoff.expandedScript.script}</p></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Platform / aspect ratio</span><b>{platform} · {platform === "tiktok" || platform === "instagram" ? "9:16" : "16:9"}</b></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Supported output duration</span><b>{clipLabel(modelId)}</b></div>
                  {signedProductImageUrl && <img src={signedProductImageUrl} alt="Exact selected visual" className="h-24 w-full rounded-lg object-contain bg-black" />}
                </div>}
                {/* Production row */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <span className="text-sm text-muted-foreground">Production</span>
                  <span className="text-sm font-semibold text-white">Complete AI advertisement</span>
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
