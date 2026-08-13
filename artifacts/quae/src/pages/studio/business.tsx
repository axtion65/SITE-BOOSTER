import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { marketingApi } from "@/lib/marketing-api";
import { Field, fieldClass, MarketingPage, SaveButton } from "./marketing-shared";

const empty: Record<string, any> = { name: "", description: "", industry: "", website: "", phone: "", publicEmail: "", streetAddress: "", city: "", region: "", country: "", targetCustomer: "", primaryGoal: "", productsServices: "", primaryCta: "", tagline: "", preferredChannels: [], socialLinks: {} };
export default function BusinessPage() {
  const [form, setForm] = useState(empty); const [saving, setSaving] = useState(false); const { toast } = useToast();
  useEffect(() => { marketingApi<any>("/business").then((v) => v && setForm({ ...empty, ...v })).catch(() => {}); }, []);
  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));
  async function save(e: React.FormEvent) { e.preventDefault(); setSaving(true); try { setForm({ ...form, ...await marketingApi<any>("/business", { method: "PUT", body: JSON.stringify(form) }) }); toast({ title: "Business profile saved", description: "Your marketing team will reuse this context." }); } catch (error) { toast({ title: "Could not save", description: String((error as Error).message), variant: "destructive" }); } finally { setSaving(false); } }
  return <MarketingPage eyebrow="Marketing foundation" title="Your business" description="Teach Quae the essentials once. We only use details you provide and never invent missing business information."><form onSubmit={save} className="p-6 rounded-2xl border border-violet-400/20 bg-[#121525]/90 shadow-2xl shadow-violet-950/30 grid md:grid-cols-2 gap-5">
    <Field label="Business name"><input required className={fieldClass} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Industry / category"><input className={fieldClass} value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value)} /></Field>
    <Field label="Business description" wide><textarea className={fieldClass} rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
    {[['website','Website','url'],['phone','Phone','text'],['publicEmail','Public email','email'],['streetAddress','Street address','text'],['city','City','text'],['region','State / region','text'],['country','Country','text'],['tagline','Tagline','text'],['primaryCta','Primary call-to-action','text']].map(([key,label,type]) => <Field key={key} label={label}><input type={type} className={fieldClass} value={form[key] ?? ""} onChange={(e) => set(key,e.target.value)} /></Field>)}
    {[['targetCustomer','Target customer'],['primaryGoal','Primary business goal'],['productsServices','Main products / services']].map(([key,label]) => <Field key={key} label={label} wide><textarea className={fieldClass} rows={3} value={form[key] ?? ""} onChange={(e) => set(key,e.target.value)} /></Field>)}
    <Field label="Preferred marketing channels (comma separated)" wide><input className={fieldClass} value={(form.preferredChannels ?? []).join(", ")} onChange={(e) => set("preferredChannels", e.target.value.split(",").map(v=>v.trim()).filter(Boolean))} /></Field>
    <div className="md:col-span-2"><SaveButton saving={saving} /></div>
  </form></MarketingPage>;
}
