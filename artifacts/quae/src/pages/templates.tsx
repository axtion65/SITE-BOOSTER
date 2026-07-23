import { useState } from "react";
import { useListTemplates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Play, Sparkles, LayoutTemplate } from "lucide-react";
import { Link, useLocation } from "wouter";

// These must match the category values in the backend TEMPLATES array exactly
const CATEGORIES = ["All", "Trending", "TikTok Ad", "Amazon Listing", "Shopify Promo", "Before & After", "UGC Review"];

export default function Templates() {
  const [category, setCategory] = useState("All");
  const [, setLocation] = useLocation();

  // Pass undefined if 'All' to match API expectations
  const apiCategory = category === "All" ? undefined : category;
  const { data: templates, isLoading } = useListTemplates({ category: apiCategory });

  const handleUseTemplate = (t: { platform: string; duration: string; name: string; description: string; id: string }) => {
    const params = new URLSearchParams({
      templateId: t.id,
      templateName: t.name,
      platform: t.platform.toLowerCase(),
      duration: t.duration,
      templateDesc: t.description,
    });
    setLocation(`/studio?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Template Gallery
          </Link>
          <Link href="/studio">
            <Button variant="outline">Back to Studio</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-12">
        <div className="max-w-2xl mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-4">Start with a proven format</h1>
          <p className="text-lg text-muted-foreground">High-converting video structures tested across millions of ad dollars. Pick a template and customize it with your product.</p>
        </div>

        <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <Tabs value={category} onValueChange={setCategory} className="w-max">
            <TabsList className="bg-transparent border border-border p-1 h-auto rounded-full">
              {CATEGORIES.map(cat => (
                <TabsTrigger 
                  key={cat} 
                  value={cat}
                  className="rounded-full px-5 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {templates?.map(t => (
              <Card key={t.id} className="group overflow-hidden border-border bg-card hover:border-primary/50 transition-all duration-300">
                <div className="aspect-[9/16] bg-secondary relative overflow-hidden">
                  {/* Mock Thumbnail Image placeholder */}
                  <div className="absolute inset-0 bg-gradient-to-br from-black/80 to-transparent z-10" />
                  {t.thumbnailUrl ? (
                    <img
                      src={t.thumbnailUrl}
                      alt={t.name}
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all duration-500 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/30 via-purple-900/40 to-black" />
                  )}
                  
                  <div className="absolute top-3 left-3 z-20 flex gap-2">
                    {t.isPremium && (
                      <Badge className="bg-amber-500 text-black hover:bg-amber-500 font-bold border-none shadow-lg">
                        <Sparkles className="h-3 w-3 mr-1" /> PRO
                      </Badge>
                    )}
                    <Badge variant="secondary" className="bg-black/50 backdrop-blur-md text-white border-white/10">
                      {t.duration}
                    </Badge>
                  </div>
                  
                  <div className="absolute inset-0 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="h-14 w-14 rounded-full bg-primary/90 text-white flex items-center justify-center shadow-xl shadow-primary/30 transform scale-90 group-hover:scale-100 transition-transform">
                      <Play className="h-6 w-6 ml-1" />
                    </div>
                  </div>
                  
                  <div className="absolute bottom-0 w-full p-4 z-20 bg-gradient-to-t from-black via-black/80 to-transparent">
                    <h3 className="font-bold text-white text-lg mb-1">{t.name}</h3>
                    <p className="text-sm text-white/70 line-clamp-1">{t.description}</p>
                  </div>
                </div>
                
                <CardContent className="p-4 flex items-center justify-between bg-card border-t border-border">
                  <Badge variant="outline" className="text-muted-foreground uppercase text-[10px] tracking-wider">
                    {t.platform}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => handleUseTemplate(t)}
                  >
                    Use Template
                  </Button>
                </CardContent>
              </Card>
            ))}
            
            {templates?.length === 0 && (
              <div className="col-span-full py-24 text-center">
                <LayoutTemplate className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-white mb-2">No templates found</h3>
                <p className="text-muted-foreground">We couldn't find any templates for "{category}".</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
