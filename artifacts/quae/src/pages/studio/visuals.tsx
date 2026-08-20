import { useEffect, useState } from "react";
import { Download, ImageOff, Loader2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { marketingApi } from "@/lib/marketing-api";
import { downloadMockupVersion, studioMockupUrl, type MockupProject, type MockupVersion } from "@/lib/mockup-library";
import { MarketingImage, MarketingPage, StatusPill } from "./marketing-shared";
import { useToast } from "@/hooks/use-toast";

function VisualCard({ project }: { project: MockupProject }) {
  const available = project.versions.filter(version=>version.object_path);
  const [selectedId,setSelectedId] = useState(available[0]?.id ?? "");
  const selected = project.versions.find(version=>version.id===selectedId) ?? available[0];
  const { toast } = useToast();
  const download = async()=>{if(!selected)return;try{await downloadMockupVersion(selected,project.product_name)}catch(error){toast({title:"Download unavailable",description:(error as Error).message,variant:"destructive"})}};

  return <article className="overflow-hidden rounded-[24px] border border-white/[.08] bg-[#111c30] shadow-xl shadow-slate-950/10">
    <div className="flex aspect-[4/3] items-center justify-center bg-[#08111f]">
      {selected?.object_path ? <MarketingImage objectPath={selected.object_path} alt={`${project.product_name}, version ${selected.version_number}`} className="h-full w-full object-contain"/> : <div className="text-center text-slate-500"><ImageOff className="mx-auto mb-2"/><span className="text-sm">No finished image yet</span></div>}
    </div>
    <div className="p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">{project.product_name}</h2><p className="mt-1 text-xs text-slate-400">{new Date(project.updated_at||project.created_at).toLocaleDateString()}</p></div><StatusPill>{project.status.replaceAll("_"," ")}</StatusPill></div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-violet-300">{project.versions.length} {project.versions.length===1?"version":"versions"}</p>
      {project.versions.length>0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Saved versions">{project.versions.map((version:MockupVersion)=><button key={version.id} onClick={()=>setSelectedId(version.id)} disabled={!version.object_path} aria-pressed={selected?.id===version.id} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${selected?.id===version.id?"border-violet-400 bg-violet-500/20 text-white":"border-white/10 text-slate-300"}`}>Version {version.version_number}</button>)}</div>}
      <div className="mt-5 grid grid-cols-2 gap-3"><Link href={studioMockupUrl(project.id)} className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-bold text-white"><RefreshCw className="h-4 w-4"/>Open in Studio</Link><button onClick={download} disabled={!selected?.object_path} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-sm font-bold disabled:opacity-40"><Download className="h-4 w-4"/>Download</button></div>
    </div>
  </article>;
}

export default function VisualsPage(){
  const [projects,setProjects]=useState<MockupProject[]|null>(null),[error,setError]=useState(false);
  useEffect(()=>{marketingApi<MockupProject[]>("/mockups").then(setProjects).catch(()=>setError(true))},[]);
  return <MarketingPage eyebrow="Creative" title="My Visuals" description="Every saved product mockup, ready to reopen or download.">
    {!projects&&!error&&<div className="flex justify-center py-20"><Loader2 aria-label="Loading visuals" className="animate-spin text-violet-300"/></div>}
    {error&&<div className="rounded-2xl border border-red-300/20 bg-red-500/5 p-8 text-center text-slate-300">We couldn’t load your visuals. Your saved projects have not been changed.</div>}
    {projects?.length===0&&<div className="rounded-2xl border border-white/10 bg-white/[.03] p-10 text-center"><ImageOff className="mx-auto text-slate-500"/><h2 className="mt-4 text-lg font-semibold">No visuals yet</h2><p className="mt-2 text-sm text-slate-400">Visuals you create in Mockup Studio will appear here.</p></div>}
    {projects&&projects.length>0&&<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{projects.map(project=><VisualCard key={project.id} project={project}/>)}</div>}
  </MarketingPage>;
}
