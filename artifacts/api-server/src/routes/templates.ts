import { Router } from "express";

const router = Router();

const TEMPLATES = [
  { id: "t1", name: "Product Unboxing", category: "Trending", platform: "YouTube", duration: "60s", description: "Build excitement as you reveal your product from its packaging.", thumbnailUrl: null, isPremium: false },
  { id: "t2", name: "TikTok Ad", category: "TikTok Ad", platform: "TikTok", duration: "15s", description: "Short-form viral content optimized for TikTok's algorithm.", thumbnailUrl: null, isPremium: false },
  { id: "t3", name: "Amazon Listing", category: "Amazon Listing", platform: "Amazon", duration: "15s", description: "Showcase features and benefits optimized for Amazon search.", thumbnailUrl: null, isPremium: false },
  { id: "t4", name: "Shopify Promo", category: "Shopify Promo", platform: "YouTube", duration: "60s", description: "Drive traffic from social media directly to your Shopify store.", thumbnailUrl: null, isPremium: false },
  { id: "t5", name: "Before & After", category: "Before & After", platform: "Instagram", duration: "30s", description: "Show dramatic transformation to hook your audience instantly.", thumbnailUrl: null, isPremium: true },
  { id: "t6", name: "UGC Review", category: "UGC Review", platform: "TikTok", duration: "30s", description: "Authentic customer-style review that builds trust and drives sales.", thumbnailUrl: null, isPremium: false },
  { id: "t7", name: "Instagram Reel", category: "Trending", platform: "Instagram", duration: "30s", description: "Visually stunning reel designed for Instagram's Explore page.", thumbnailUrl: null, isPremium: false },
  { id: "t8", name: "Product Demo", category: "Trending", platform: "YouTube", duration: "60s", description: "Detailed demonstration of your product in action.", thumbnailUrl: null, isPremium: true },
  { id: "t9", name: "Flash Sale", category: "Shopify Promo", platform: "TikTok", duration: "15s", description: "Urgency-driven content to maximize flash sale conversions.", thumbnailUrl: null, isPremium: false },
  { id: "t10", name: "Brand Story", category: "Trending", platform: "YouTube", duration: "60s", description: "Emotional brand storytelling that builds lasting loyalty.", thumbnailUrl: null, isPremium: true },
  { id: "t11", name: "Testimonial Compilation", category: "UGC Review", platform: "Instagram", duration: "30s", description: "Stack social proof with multiple customer testimonials.", thumbnailUrl: null, isPremium: false },
  { id: "t12", name: "Tutorial", category: "Amazon Listing", platform: "YouTube", duration: "60s", description: "Step-by-step tutorial showing exactly how to use your product.", thumbnailUrl: null, isPremium: false },
];

router.get("/templates", (req, res) => {
  const { category } = req.query;
  let results = TEMPLATES;
  if (category && category !== "All") {
    results = TEMPLATES.filter((t) => t.category === category);
  }
  res.json(results);
});

router.get("/templates/:id", (req, res) => {
  const template = TEMPLATES.find((t) => t.id === req.params.id);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(template);
});

export default router;
