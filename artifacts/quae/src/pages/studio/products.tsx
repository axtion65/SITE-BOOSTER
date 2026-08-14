import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, ArrowRight, Check, ImagePlus, Package, Pencil, Plus, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { marketingApi, uploadMarketingImage } from "@/lib/marketing-api";
import { Field, fieldClass, MarketingImage, MarketingPage, SaveButton } from "./marketing-shared";
type Image = { id:string; objectPath:string; role:"primary"|"reference" }; type Product = Record<string,any>&{id:string;name:string;type:string;active:boolean;images:Image[]};
const empty:Record<string,any>={name:"",type:"product",description:"",category:"",regularPrice:"",salePrice:"",currency:"USD",sku:"",productUrl:"",benefits:[],features:[],targetCustomer:"",problemSolved:"",offerNotes:"",cta:"",active:true};
export default function ProductsPage(){const [items,setItems]=useState<Product[]>([]);const [editing,setEditing]=useState<Record<string,any>|null>(null);const [saving,setSaving]=useState(false);const {toast}=useToast();
 const load=()=>marketingApi<Product[]>("/products").then(setItems).catch(()=>{});useEffect(()=>{void load();},[]);
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);try{const hasId=!!editing?.id;const item=await marketingApi<Product>(hasId?`/products/${editing.id}`:"/products",{method:hasId?"PATCH":"POST",body:JSON.stringify({...editing,regularPrice:editing?.regularPrice||null,salePrice:editing?.salePrice||null,images:undefined,id:undefined,businessId:undefined,createdAt:undefined,updatedAt:undefined})});setEditing(item);await load();toast({title:hasId?"Product updated":"Product added"});}catch(e){toast({title:"Could not save",description:(e as Error).message,variant:"destructive"});}finally{setSaving(false)}}
 async function archive(id:string){try{await marketingApi(`/products/${id}`,{method:"DELETE"});await load();toast({title:"Item archived"});}catch(e){toast({title:"Could not archive",variant:"destructive"})}}
 async function addImage(file:File,role:"primary"|"reference"){if(!editing?.id){toast({title:"Save the item before adding images"});return}try{const path=await uploadMarketingImage(file);const updated=await marketingApi<Product>(`/products/${editing.id}/images`,{method:"POST",body:JSON.stringify({objectPath:path,role})});setEditing(updated);await load();toast({title:"Image added"});}catch(e){toast({title:"Image upload failed",description:(e as Error).message,variant:"destructive"})}}
 return <MarketingPage eyebrow="Reusable library" title="Products & services" description="Save the offers your marketing team should know. Product claims are only stored when you provide them."><div className="flex justify-end mb-5"><button onClick={()=>setEditing({...empty})} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 rounded-xl text-sm font-bold shadow-lg shadow-violet-900/30 transition-all"><Plus className="h-4 w-4"/>Add Product</button></div>
 {items.length===0?<div className="py-20 border border-violet-400/20 bg-[#121525]/75 shadow-xl shadow-violet-950/20 rounded-2xl text-center"><Package className="mx-auto h-9 w-9 text-violet-300/65"/><h2 className="font-bold mt-4">Your reusable offer library starts here</h2><p className="text-sm text-slate-300/60 mt-1">Add a product or service—only the name and type are required.</p></div>:<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{items.map(p=>{const image=p.images.find(i=>i.role==='primary');return <article key={p.id} className={`rounded-2xl border border-violet-400/15 bg-[#121525]/85 shadow-xl shadow-violet-950/20 overflow-hidden ${!p.active?'opacity-50':''}`}><div className="h-40 bg-[#191b2b] flex items-center justify-center">{image?<MarketingImage objectPath={image.objectPath} className="w-full h-full object-contain"/>:<Package className="text-violet-300/30 h-10 w-10"/>}</div><div className="p-5"><div className="flex justify-between"><div><span className="text-[10px] uppercase tracking-widest text-violet-300">{p.type}</span><h2 className="font-bold mt-1">{p.name}</h2></div>{p.regularPrice&&<span className="text-sm font-bold">{p.currency} {p.salePrice||p.regularPrice}</span>}</div><p className="text-sm text-slate-300/60 mt-2 line-clamp-2">{p.description||'No description yet.'}</p><div className="flex gap-2 mt-5"><Link href={`/studio/mockups?productId=${p.id}`} className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg bg-violet-600 font-semibold"><Sparkles className="h-3 w-3"/>Create visual</Link><button onClick={()=>setEditing(p)} className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg bg-violet-400/10 border border-violet-300/10 hover:bg-violet-400/15"><Pencil className="h-3 w-3"/>Edit</button>{p.active&&<button onClick={()=>archive(p.id)} className="flex items-center gap-1 text-xs px-3 py-2 text-slate-300/60"><Archive className="h-3 w-3"/>Archive</button>}</div></div></article>})}</div>}
 {editing&&<ProductEditor editing={editing} setEditing={setEditing} saving={saving} onSave={save} onAddImage={addImage}/>}
 </MarketingPage>}


const steps = ["The Offer", "Audience & Value", "Review & References"];

function ProductEditor({editing,setEditing,saving,onSave,onAddImage}:{editing:Record<string,any>;setEditing:(value:Record<string,any>|null)=>void;saving:boolean;onSave:(event:React.FormEvent)=>void;onAddImage:(file:File,role:"primary"|"reference")=>void}) {
 const [step,setStep]=useState(0);
 const brief=useMemo(()=>{
  const price=editing.salePrice||editing.regularPrice;
  const topValue=editing.benefits?.find((value:string)=>value.trim())||editing.problemSolved||editing.features?.find((value:string)=>value.trim());
  return [
   ["Offer",editing.name],
   ["Category",editing.category],
   ["Price",price?`${editing.currency||"USD"} ${price}`:""],
   ["Audience",editing.targetCustomer],
   ["Top Value",topValue],
   ["Call-to-Action",editing.cta],
  ];
 },[editing]);
 const readiness=Math.round(brief.filter(([,value])=>Boolean(value)).length/brief.length*100);
 const update=(key:string,value:any)=>setEditing({...editing,[key]:value});
 function submit(event:React.FormEvent){if(step<2){event.preventDefault();setStep(step+1);return}onSave(event)}
 return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#07101f]/90 backdrop-blur-lg">
  <div className="mx-auto min-h-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
   <div className="overflow-hidden rounded-[28px] border border-white/[.08] bg-[#111a2b] shadow-[0_30px_100px_rgba(2,6,23,.65)]">
    <header className="relative border-b border-white/[.07] px-6 py-6 sm:px-9">
     <button type="button" onClick={()=>setEditing(null)} aria-label="Close product editor" className="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition hover:bg-white/[.06] hover:text-white"><X className="h-5 w-5"/></button>
     <p className="text-[10px] font-bold uppercase tracking-[.24em] text-violet-300">Quae Offer Intelligence</p>
     <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Teach Quae about your offer</h2>
     <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">Build the context your AI marketing department will use to create sharper, more relevant work.</p>
     <div className="mt-6 grid max-w-3xl grid-cols-3 gap-2 sm:gap-4">{steps.map((label,index)=><button key={label} type="button" onClick={()=>index<step&&setStep(index)} className="text-left">
      <span className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${index<step?'bg-emerald-400/15 text-emerald-300':index===step?'bg-violet-500 text-white shadow-[0_0_22px_rgba(139,92,246,.32)]':'bg-white/[.05] text-slate-500'}`}>{index<step?<Check className="h-3.5 w-3.5"/>:index+1}</span>
      <span className={`block text-[11px] font-semibold sm:text-xs ${index===step?'text-white':index<step?'text-slate-300':'text-slate-500'}`}>{label}</span>
     </button>)}</div>
    </header>
    <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
     <form onSubmit={submit} className="min-w-0 bg-[#151f32] px-6 py-7 sm:px-9 sm:py-9">
      <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300/90">Step {step+1} of 3</p><h3 className="mt-2 text-xl font-semibold text-white">{steps[step]}</h3></div>
      {step===0&&<div className="grid gap-5 sm:grid-cols-2">
       <Field label="Offer name"><input required autoFocus placeholder="e.g. Growth Strategy Sprint" className={fieldClass} value={editing.name} onChange={e=>update('name',e.target.value)}/></Field>
       <Field label="Offer type"><select className={fieldClass} value={editing.type} onChange={e=>update('type',e.target.value)}><option value="product">Product</option><option value="service">Service</option></select></Field>
       <Field label="Description" wide><textarea rows={4} placeholder="What is it, and what makes it worth choosing?" className={fieldClass} value={editing.description??''} onChange={e=>update('description',e.target.value)}/></Field>
       {[['category','Category','text','e.g. Business consulting'],['regularPrice','Regular price','number','0.00'],['salePrice','Sale price','number','Optional'],['currency','Currency','text','USD'],['sku','SKU','text','Optional'],['productUrl','Product URL','url','https://']].map(([k,l,t,placeholder])=><Field key={k} label={l}><input type={t} placeholder={placeholder} min={t==='number'?0:undefined} step={t==='number'?'.01':undefined} className={fieldClass} value={editing[k]??''} onChange={e=>update(k,e.target.value)}/></Field>)}
      </div>}
      {step===1&&<div className="grid gap-5 sm:grid-cols-2">
       <Field label="Target audience" wide><textarea autoFocus rows={3} placeholder="Who is this offer designed for?" className={fieldClass} value={editing.targetCustomer??''} onChange={e=>update('targetCustomer',e.target.value)}/></Field>
       {[['benefits','Main benefits','One outcome per line'],['features','Key features','One feature per line']].map(([k,l,placeholder])=><Field key={k} label={l}><textarea rows={5} placeholder={placeholder} className={fieldClass} value={(editing[k]??[]).join('\n')} onChange={e=>update(k,e.target.value.split('\n').map(v=>v.trim()).filter(Boolean))}/></Field>)}
       <Field label="Customer problem solved"><textarea rows={4} placeholder="What tension or pain does it remove?" className={fieldClass} value={editing.problemSolved??''} onChange={e=>update('problemSolved',e.target.value)}/></Field>
       <Field label="Call-to-action"><textarea rows={4} placeholder="What should the customer do next?" className={fieldClass} value={editing.cta??''} onChange={e=>update('cta',e.target.value)}/></Field>
      </div>}
      {step===2&&<div className="space-y-7">
       <Field label="Offer / promotion notes"><textarea autoFocus rows={4} placeholder="Add timing, positioning, constraints, or promotional context." className={fieldClass} value={editing.offerNotes??''} onChange={e=>update('offerNotes',e.target.value)}/></Field>
       <div className="rounded-2xl bg-[#101929] p-5 ring-1 ring-white/[.06]"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-300">Product references</p>
        {editing.id?<><div className="mt-4 flex flex-wrap gap-3">{editing.images?.map((image:Image)=><MarketingImage key={image.id} objectPath={image.objectPath} className={`h-20 w-20 rounded-xl bg-[#1a2436] object-contain ${image.role==='primary'?'ring-2 ring-violet-500':''}`}/>)}{(['primary','reference'] as const).map(role=><label key={role} className="flex h-20 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-600/70 bg-[#182236] px-4 text-xs text-slate-400 transition hover:border-violet-400/70 hover:text-slate-200"><ImagePlus className="mb-1 h-4 w-4 text-violet-300"/>Add {role}<input hidden type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&onAddImage(e.target.files[0],role)}/></label>)}</div><p className="mt-3 text-[11px] text-slate-500">Original uploads are preserved in private object storage.</p></>:<p className="mt-3 text-sm leading-6 text-slate-400">Save this offer first, then reopen it to add primary and reference images.</p>}
       </div>
      </div>}
      <div className="mt-9 flex items-center justify-between border-t border-white/[.07] pt-6">
       <button type="button" onClick={()=>step===0?setEditing(null):setStep(step-1)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-white/[.05] hover:text-white"><ArrowLeft className="h-4 w-4"/>{step===0?'Cancel':'Back'}</button>
       {step<2?<button type="submit" className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-500">Continue <ArrowRight className="h-4 w-4"/></button>:<SaveButton saving={saving}>{editing.id?'Save changes':'Create item'}</SaveButton>}
      </div>
     </form>
     <aside className="relative bg-[#0e1728] px-6 py-7 md:px-7 md:py-9"><div className="sticky top-8">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-violet-300">Quae Live Brief</p><h3 className="mt-2 text-base font-semibold text-white">Marketing intelligence</h3></div><span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/[.09] px-2.5 py-1 text-[10px] font-bold text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300"/>Learning live</span></div>
      <div className="mt-6 rounded-2xl bg-white/[.035] p-4 ring-1 ring-white/[.06]"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-300">Context Readiness</span><span className="font-bold text-violet-300">{readiness}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-500" style={{width:`${readiness}%`}}/></div><p className="mt-3 text-[11px] leading-5 text-slate-500">Quae is learning your business as you type.</p></div>
      <dl className="mt-6 space-y-5">{brief.map(([label,value])=><div key={label}><dt className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">{label}</dt><dd className={`mt-1.5 break-words text-sm leading-5 transition-colors ${value?'font-medium text-slate-100':'italic text-slate-600'}`}>{value||'Waiting for details.'}</dd></div>)}</dl>
      <div className="mt-7 flex gap-3 rounded-2xl bg-violet-500/[.07] p-4 ring-1 ring-violet-400/10"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300"/><p className="text-xs leading-5 text-slate-400">Every detail helps Quae create more specific campaigns, messaging, and creative direction.</p></div>
     </div></aside>
    </div>
   </div>
  </div>
 </div>
}
