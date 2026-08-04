import { Router } from "express";
import { TEMPLATES } from "@workspace/templates";

// Re-export so other parts of the server can import TEMPLATES from here.
export { TEMPLATES };

// ---------------------------------------------------------------------------
// The template catalog now lives in lib/templates/src/index.ts (shared).
// To add, rename, or remove a template, edit that file — TypeScript will flag
// every consumer (this route, the web hero mockup, etc.) that needs updating.
// ---------------------------------------------------------------------------

const router = Router();

router.get("/templates", (req, res) => {
  const { category } = req.query;
  const filtered = category
    ? TEMPLATES.filter(t => t.category === category)
    : TEMPLATES;
  res.json(filtered);
});

router.get("/templates/:id", (req, res) => {
  const template = TEMPLATES.find(t => t.id === req.params.id);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(template);
});

export default router;
