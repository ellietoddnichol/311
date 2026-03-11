
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import db, { initDb } from "./src/server/db.ts";
import { calculateEstimate } from "./src/server/engine.ts";
import { Project, CatalogItem } from "./src/types.ts";
import { syncCatalogFromSheets } from "./src/server/sheets.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  initDb();
  
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  // Health
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Projects
  app.get("/api/projects", (req, res) => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_date DESC').all();
    res.json(projects.map((p: any) => ({
      id: p.id,
      projectNumber: p.project_number,
      name: p.name,
      clientName: p.client_name,
      gcName: p.gc_name,
      address: p.address,
      bidDate: p.bid_date,
      dueDate: p.due_date,
      projectType: p.project_type,
      estimator: p.estimator,
      status: p.status,
      createdDate: p.created_date,
      settings: JSON.parse(p.settings),
      proposalSettings: JSON.parse(p.proposal_settings),
      scopes: JSON.parse(p.scopes),
      rooms: JSON.parse(p.rooms),
      bundles: JSON.parse(p.bundles),
      alternates: JSON.parse(p.alternates),
      lines: JSON.parse(p.lines)
    })));
  });

  app.get("/api/projects/:id", (req, res) => {
    const p: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: "Project not found" });
    res.json({
      id: p.id,
      projectNumber: p.project_number,
      name: p.name,
      clientName: p.client_name,
      gcName: p.gc_name,
      address: p.address,
      bidDate: p.bid_date,
      dueDate: p.due_date,
      projectType: p.project_type,
      estimator: p.estimator,
      status: p.status,
      createdDate: p.created_date,
      settings: JSON.parse(p.settings),
      proposalSettings: JSON.parse(p.proposal_settings),
      scopes: JSON.parse(p.scopes),
      rooms: JSON.parse(p.rooms),
      bundles: JSON.parse(p.bundles),
      alternates: JSON.parse(p.alternates),
      lines: JSON.parse(p.lines)
    });
  });

  app.post("/api/projects", (req, res) => {
    const p: Project = req.body;
    db.prepare(`
      INSERT INTO projects (id, project_number, name, client_name, gc_name, address, bid_date, due_date, project_type, estimator, status, created_date, settings, proposal_settings, scopes, rooms, bundles, alternates, lines)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.id, p.projectNumber || null, p.name, p.clientName, p.gcName || null, p.address, p.bidDate || null, p.dueDate || null, p.projectType || null, p.estimator || null, p.status, p.createdDate,
      JSON.stringify(p.settings), JSON.stringify(p.proposalSettings), JSON.stringify(p.scopes), JSON.stringify(p.rooms),
      JSON.stringify(p.bundles), JSON.stringify(p.alternates), JSON.stringify(p.lines)
    );
    res.status(201).json(p);
  });

  app.put("/api/projects/:id", (req, res) => {
    const p: Project = req.body;
    db.prepare(`
      UPDATE projects SET 
        project_number = ?, name = ?, client_name = ?, gc_name = ?, address = ?, bid_date = ?, due_date = ?, project_type = ?, estimator = ?, status = ?, 
        settings = ?, proposal_settings = ?, scopes = ?, rooms = ?, bundles = ?, alternates = ?, lines = ?
      WHERE id = ?
    `).run(
      p.projectNumber || null, p.name, p.clientName, p.gcName || null, p.address, p.bidDate || null, p.dueDate || null, p.projectType || null, p.estimator || null, p.status,
      JSON.stringify(p.settings), JSON.stringify(p.proposalSettings), JSON.stringify(p.scopes), JSON.stringify(p.rooms),
      JSON.stringify(p.bundles), JSON.stringify(p.alternates), JSON.stringify(p.lines),
      req.params.id
    );
    res.json(p);
  });

  app.delete("/api/projects/:id", (req, res) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.status(204).send();
  });

  // Catalog
  app.get("/api/catalog/items", (req, res) => {
    const items = db.prepare('SELECT * FROM catalog_items WHERE active = 1').all();
    res.json(items.map((i: any) => ({
      ...i,
      baseMaterialCost: i.base_material_cost,
      baseLaborMinutes: i.base_labor_minutes,
      laborUnitType: i.labor_unit_type,
      taxable: !!i.taxable,
      adaFlag: !!i.ada_flag,
      tags: i.tags ? JSON.parse(i.tags) : []
    })));
  });

  app.post("/api/catalog/items", (req, res) => {
    const i: CatalogItem = req.body;
    db.prepare(`
      INSERT INTO catalog_items (id, sku, category, subcategory, family, description, manufacturer, model, uom, base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      i.id, i.sku, i.category, i.subcategory || null, i.family || null, i.description, i.manufacturer || null, i.model || null, i.uom,
      i.baseMaterialCost, i.baseLaborMinutes, i.laborUnitType || null, i.taxable ? 1 : 0, i.adaFlag ? 1 : 0, JSON.stringify(i.tags || []), i.notes || null, i.active ? 1 : 0
    );
    res.status(201).json(i);
  });

  app.put("/api/catalog/items/:id", (req, res) => {
    const i: CatalogItem = req.body;
    db.prepare(`
      UPDATE catalog_items SET 
        sku = ?, category = ?, subcategory = ?, family = ?, description = ?, manufacturer = ?, model = ?, uom = ?, 
        base_material_cost = ?, base_labor_minutes = ?, labor_unit_type = ?, taxable = ?, ada_flag = ?, tags = ?, notes = ?, active = ?
      WHERE id = ?
    `).run(
      i.sku, i.category, i.subcategory || null, i.family || null, i.description, i.manufacturer || null, i.model || null, i.uom,
      i.baseMaterialCost, i.baseLaborMinutes, i.laborUnitType || null, i.taxable ? 1 : 0, i.adaFlag ? 1 : 0, JSON.stringify(i.tags || []), i.notes || null, i.active ? 1 : 0,
      req.params.id
    );
    res.json(i);
  });

  app.delete("/api/catalog/items/:id", (req, res) => {
    db.prepare('UPDATE catalog_items SET active = 0 WHERE id = ?').run(req.params.id);
    res.status(204).send();
  });

  // Global Bundles
  app.get("/api/global/bundles", (req, res) => {
    const bundles = db.prepare('SELECT * FROM global_bundles').all();
    res.json(bundles.map((b: any) => ({
      id: b.id,
      name: b.name,
      items: JSON.parse(b.items)
    })));
  });

  // Global AddIns
  app.get("/api/global/addins", (req, res) => {
    const addins = db.prepare('SELECT * FROM global_addins').all();
    res.json(addins.map((a: any) => ({
      id: a.id,
      name: a.name,
      cost: a.cost,
      laborMinutes: a.labor_minutes
    })));
  });

  app.post("/api/sync/sheets", async (req, res) => {
    try {
      const result = await syncCatalogFromSheets();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Estimate
  app.post("/api/estimate/calculate", (req, res) => {
    const project: Project = req.body;
    const catalog = db.prepare('SELECT * FROM catalog_items').all().map((i: any) => ({
      ...i,
      baseMaterialCost: i.base_material_cost,
      baseLaborMinutes: i.base_labor_minutes,
      laborUnitType: i.labor_unit_type,
      taxable: !!i.taxable,
      adaFlag: !!i.ada_flag,
      tags: i.tags ? JSON.parse(i.tags) : []
    }));
    const result = calculateEstimate(project, catalog);
    res.json(result);
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    const s: any = db.prepare('SELECT value FROM settings WHERE key = ?').get('global');
    res.json(JSON.parse(s.value));
  });

  app.put("/api/settings", (req, res) => {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(req.body), 'global');
    res.json(req.body);
  });

  // 404 for API routes
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  // --- Vite / Static ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "dist/index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
