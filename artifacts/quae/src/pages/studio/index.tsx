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
import { Switch } from "@/components/ui/switch";
import { Sparkles, Wand2, Film, Download, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { ExpandedScript } from "@workspace/api-client-react";

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
  const [modelId, setModelId] = useState<string>("");
  
  // Step 1 State
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [duration, setDuration] = useState("15s");

  // Step 2 State
  const [expandedScript, setExpandedScript] = useState<ExpandedScript | null>(null);
  
  // Step 3 State
  const [voice, setVoice] = useState("nova");
  const [music, setMusic] = useState(true);
  const [captions, setCaptions] = useState(true);

  const { data: models, isLoading: modelsLoading } = useListRenderingModels();
  const expandMutation = useExpandPrompt();
  const createMutation = useCreateProject();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();

  // Pre-fill from template URL params (e.g. ?templateId=t2&platform=tiktok&duration=15s&templateName=TikTok+Ad)
  const templateApplied = useRef(false);
  useEffect(() => {
    if (templateApplied.current) return;
    const params = new URLSearchParams(search);
    const tName = params.get("templateName");
    const tPlatform = params.get("platform");
    const tDuration = params.get("duration");
    const tDesc = params.get("templateDesc");
    if (tName || tPlatform || tDuration) {
      templateApplied.current = true;
      if (tName) setProductName("");          // user still fills product name
      if (tDesc) setDescription(tDesc);       // pre-fill with template hint
      if (tPlatform) setPlatform(tPlatform.toLowerCase().replace(" ", ""));
      if (tDuration) setDuration(tDuration);
      if (tName) {
        toast({ title: `Template loaded: ${tName}`, description: "Fill in your product name and description, then click Expand with AI." });
      }
    }
  }, [search]);

  // Set default model once loaded
  if (models && !modelId && models.length > 0) {
    setModelId(models[0].id);
  }

  const handleExpand = async () => {
    if (!productName || !description) {
      toast({ title: "Missing fields", description: "Product name and description are required.", variant: "destructive" });
      return;
    }
    
    try {
      const res = await expandMutation.mutateAsync({
        data: { productName, description, targetAudience, platform, duration }
      });
      setExpandedScript(res);
      setStep(2);
    } catch (err: any) {
      toast({ title: "Expansion failed", description: err.message || "Failed to generate script", variant: "destructive" });
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
          duration
        }
      });
      toast({ title: "Project saved", description: "Your video project has been created." });
      setLocation(`/studio/projects/${res.id}`);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Top Header with Model Selector & Breadcrumbs */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 z-10">
        <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
          <span className={step >= 1 ? "text-primary" : ""}>1. Describe</span>
          <ChevronRight className="h-4 w-4" />
          <span className={step >= 2 ? "text-primary" : ""}>2. AI Script</span>
          <ChevronRight className="h-4 w-4" />
          <span className={step >= 3 ? "text-primary" : ""}>3. Customize</span>
          <ChevronRight className="h-4 w-4" />
          <span className={step >= 4 ? "text-primary" : ""}>4. Export</span>
        </div>
        
        <div className="flex items-center gap-3">
          <Label className="text-muted-foreground">Rendering Engine:</Label>
          <div className="w-64">
            <Select value={modelId} onValueChange={setModelId} disabled={modelsLoading}>
              <SelectTrigger className="h-9 bg-background border-border">
                <SelectValue placeholder="Select an engine" />
              </SelectTrigger>
              <SelectContent>
                {models?.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center justify-between w-full pr-4">
                      <span>{m.name}</span>
                      <Badge variant={m.tier === 'free' ? 'outline' : 'default'} className="ml-2 text-[10px] h-4">
                        {m.tier}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-12 scroll-smooth">
        <div className="max-w-3xl mx-auto">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Describe your product</h2>
                <p className="text-muted-foreground">Give us the raw details. Our AI will build the narrative.</p>
              </div>

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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                  Expand with AI
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && expandedScript && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Cinematic Script Generated</h2>
                  <p className="text-muted-foreground">Review the scenes and voiceover text.</p>
                </div>
                <Button variant="outline" onClick={() => setStep(1)}>Back to Edit</Button>
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
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Full Voiceover Text</div>
                <p className="text-sm leading-relaxed">{expandedScript.voiceoverText}</p>
              </div>

              <Button 
                size="lg" 
                className="w-full h-14 text-lg font-bold"
                onClick={() => setStep(3)}
              >
                Looks Good <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Customize Audio & Style</h2>
                  <p className="text-muted-foreground">Add the finishing touches.</p>
                </div>
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {([
                  { id: "nova",    label: "Nova",    desc: "Warm & Energetic" },
                  { id: "echo",    label: "Echo",    desc: "Deep & Authoritative" },
                  { id: "onyx",    label: "Onyx",    desc: "Rich & Professional" },
                  { id: "alloy",   label: "Alloy",   desc: "Clear & Confident" },
                  { id: "shimmer", label: "Shimmer", desc: "Light & Vibrant" },
                  { id: "fable",   label: "Fable",   desc: "Narrative & Cinematic" },
                ] as const).map(v => (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${voice === v.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-white/20'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold capitalize text-white">{v.label}</span>
                      {voice === v.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Activity className="h-3 w-3" /> {v.desc}
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                  <div>
                    <div className="font-medium text-white">Background Music</div>
                    <div className="text-sm text-muted-foreground">Auto-generate matching background track</div>
                  </div>
                  <Switch checked={music} onCheckedChange={setMusic} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                  <div>
                    <div className="font-medium text-white">Dynamic Captions</div>
                    <div className="text-sm text-muted-foreground">Add animated captions for social media</div>
                  </div>
                  <Switch checked={captions} onCheckedChange={setCaptions} />
                </div>
              </div>

              <Button 
                size="lg" 
                className="w-full h-14 text-lg font-bold"
                onClick={() => setStep(4)}
              >
                Proceed to Export <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-12">
              <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Wand2 className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Ready to Render</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Your project is configured and ready. We'll save the project and begin rendering the video using the {models?.find(m => m.id === modelId)?.name || 'selected'} engine.
              </p>

              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-10">
                <div className="p-4 rounded-xl border border-primary bg-primary/10 text-center">
                  <div className="text-white font-bold mb-1">9:16</div>
                  <div className="text-xs text-muted-foreground">TikTok</div>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card opacity-50 text-center">
                  <div className="text-white font-bold mb-1">16:9</div>
                  <div className="text-xs text-muted-foreground">YouTube</div>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card opacity-50 text-center">
                  <div className="text-white font-bold mb-1">1:1</div>
                  <div className="text-xs text-muted-foreground">Facebook</div>
                </div>
              </div>

              <div className="flex gap-4 justify-center">
                <Button variant="outline" size="lg" onClick={() => setStep(3)}>Back</Button>
                <Button 
                  size="lg" 
                  onClick={handleSaveProject}
                  disabled={createMutation.isPending}
                  className="font-bold min-w-[200px]"
                >
                  {createMutation.isPending ? <Spinner className="mr-2" /> : <Download className="mr-2 h-5 w-5" />}
                  Save & Render
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
