/**
 * api-server/src/routes/skills.ts — Skills CRUD route.
 *
 * Endpoints:
 *   GET    /api/v1/skills/:id          — fetch a single published skill (for cross-user recall)
 *   GET    /api/v1/skills              — list published skills (with optional filters)
 *   PUT    /api/v1/skills              — upsert a skill (used when publishing)
 *   DELETE /api/v1/skills/:id          — delete a skill (only author or moderator)
 *
 * All writes require Firebase auth. Reads of published skills are public.
 * Reads of private/in_review skills require the requester to be the author.
 */
import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { logger } from "../lib/logger";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { lookupMappedIdentity } from "../middleware/identity-map";
import type { VerifiedAuth } from "../lib/firebase-auth";

const router: IRouter = Router();

// Firebase subjects and Supabase UUIDs are different identity domains.
async function verifiedOwner(subject: string, res: Response): Promise<string | null> {
  try {
    const uid = await lookupMappedIdentity(subject);
    if (!uid) { res.set("Cache-Control", "no-store").status(403).json({ error: "Identity mapping required" }); return null; }
    return uid.toLowerCase();
  } catch {
    res.set("Cache-Control", "no-store").status(503).json({ error: "Identity service unavailable" });
    return null;
  }
}


const SkillRowSchema = z.object({
  id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/),
  domain: z.string().min(1),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  part: z.string().nullable().optional(),
  version: z.string().default("v1"),
  title: z.string().min(1),
  author_name: z.string().default("Anonymous"),
  author_years_experience: z.number().int().min(0).max(80).nullable().optional(),
  steps: z.array(z.any()).default([]),
  source_brain_id: z.string().nullable().optional(),
  status: z.enum(["private", "in_review", "published"]),
  reviewer_id: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
});

/**
 * Shape of a row in the Supabase public.skills table. Mirrors the
 * SkillRowSchema above and adds the server-only columns (author_id,
 * created_at, updated_at) that the API handlers read. Exported so
 * routes/search.ts can reuse it for its keyword/semantic result sets.
 */
export interface SkillRow {
  id: string;
  domain: string;
  make: string | null;
  model: string | null;
  year: number | null;
  part: string | null;
  version: string;
  title: string;
  author_name: string;
  author_years_experience: number | null;
  steps: unknown[];
  source_brain_id: string | null;
  author_id: string;
  status: "private" | "in_review" | "published";
  reviewer_id: string | null;
  published_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Public projection: do not expose unverified brain links or internal IDs. */
function publicSkill(skill: SkillRow, includeSteps = false) {
  return {
    id: skill.id, title: skill.title, domain: skill.domain, make: skill.make,
    model: skill.model, year: skill.year, part: skill.part, version: skill.version,
    author_name: skill.author_name, author_years_experience: skill.author_years_experience,
    status: skill.status, ...(includeSteps ? { steps: skill.steps } : {}),
  };
}

/**
 * GET /api/v1/skills/:id — fetch a single skill.
 * Public if status='published'; otherwise requires auth + author match.
 */
router.get("/v1/skills/:id", optionalAuth, async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid skill id" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  try {
    const rows = await supabase.get<SkillRow>("skills", {
      select: "*",
      filters: { id: `eq.${id}` },
      limit: 1,
    });
    if (rows.length === 0) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    const skill = rows[0];
    // Public skills are readable by anyone.
    if (skill.status === "published") {
      res.json(publicSkill(skill, true));
      return;
    }
    // Private/in_review skills require the requester to be the author.
    const auth: VerifiedAuth | undefined = req.auth;
    if (!auth) { res.status(403).json({ error: "Not authorized to view this skill" }); return; }
    const owner = await verifiedOwner(auth.uid, res);
    if (!owner) return;
    if (owner !== skill.author_id?.toLowerCase()) {
      res.status(403).json({ error: "Not authorized to view this skill" }); return;
    }
    res.set("Cache-Control", "no-store").json(skill);
  } catch (err) {
    // B-9 fix: previously every error (including Supabase outages / 500s)
    // was converted to 404, masking real failures and making debugging
    // impossible. Now we distinguish: SupabaseError → 502 (upstream
    // failure); everything else → 500 (logged). 404 is reserved for the
    // genuine "row not found" case handled above.
    if (err instanceof SupabaseError) {
      logger.warn({ status: err.status }, "Skill fetch failed (Supabase)");
      res.status(502).json({ error: "Skill storage unavailable" });
      return;
    }
    logger.error("Skill fetch failed (unexpected)");
    res.status(500).json({ error: "Failed to fetch skill" });
  }
});

/**
 * GET /api/v1/skills — list published skills.
 * Query params: domain, status (default 'published'), limit (default 20).
 */
router.get("/v1/skills", optionalAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.set("Cache-Control", "no-store").status(503).json({ error: "Skill storage unavailable" });
    return;
  }
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const filters: Record<string, string> = { status: "eq.published" };
    // Strict slug validation — prevents PostgREST filter-injection.
    if (typeof req.query.domain === "string" && /^[A-Za-z0-9_-]+$/.test(req.query.domain)) {
      filters.domain = `eq.${req.query.domain}`;
    }
    const rows = await supabase.get<SkillRow>("skills", {
      select: "id,title,domain,make,model,year,part,version,author_name,author_years_experience,status",
      filters,
      order: { column: "published_at", ascending: false },
      limit,
    });
    // Defense in depth: the service-role client bypasses RLS.
    res.json({ skills: rows.filter((row) => row.status === "published").map((row) => publicSkill(row)), source: "supabase" });
  } catch {
    // An unavailable store is not evidence that the list is empty.
    logger.warn("Skill list unavailable");
    res.set("Cache-Control", "no-store").status(503).json({ error: "Skill storage unavailable" });
  }
});

/**
 * PUT /api/v1/skills — upsert a skill (used when publishing).
 * Requires auth. The skill's author_id is set from the auth token.
 */
router.put("/v1/skills", requireAuth, async (req, res) => {
  const auth: VerifiedAuth | undefined = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Supabase not configured — cannot publish skill" });
    return;
  }
  const parsed = SkillRowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid skill payload", details: parsed.error.flatten() });
    return;
  }
  // A client-supplied reviewer/status is not verified moderation or identity.
  // Existing published skills remain readable; new publication stays paused.
  if (parsed.data.status === "published") {
    res.set("Cache-Control", "no-store").status(503).json({ error: "Skill publishing is temporarily unavailable" });
    return;
  }
  const owner = await verifiedOwner(auth.uid, res);
  if (!owner) return;
  const row = { ...parsed.data, author_id: owner, updated_at: new Date().toISOString() };
  try {
    // Never use merge-duplicates with service-role authority: it could replace
    // another author's row. Insert first, then update only an owned conflict.
    try {
      await supabase.insert("skills", row);
    } catch (err) {
      if (!(err instanceof SupabaseError) || err.status !== 409) throw err;
      const updated = await supabase.updateMatchingIds("skills", { id: row.id, author_id: owner }, row);
      if (updated.length !== 1 || updated[0] !== row.id) {
        res.status(403).json({ error: "Skill ownership conflict" });
        return;
      }
    }
    res.json({ ok: true, skill: row });
  } catch (err) {
    // Do not expose upstream error bodies, identity or record content.
    if (err instanceof SupabaseError) res.status(502).json({ error: "Supabase rejected the skill" });
    else res.status(500).json({ error: "Failed to publish skill" });
  }
});

/**
 * DELETE /api/v1/skills/:id — delete a skill.
 * Requires auth + author match (or moderator role, future).
 */
router.delete("/v1/skills/:id", requireAuth, async (req, res) => {
  const auth: VerifiedAuth | undefined = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid skill id" });
    return;
  }
  const owner = await verifiedOwner(auth.uid, res);
  if (!owner) return;
  try {
    // Verify ownership before delete.
    const rows = await supabase.get<SkillRow>("skills", {
      select: "id,author_id",
      filters: { id: `eq.${id}` },
      limit: 1,
    });
    if (rows.length === 0) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    if (rows[0].author_id?.toLowerCase() !== owner) {
      res.status(403).json({ error: "Not authorized to delete this skill" });
      return;
    }
    // Recheck ownership on the delete itself to close the probe/write race.
    const deleted = await supabase.deleteMatchingIds("skills", { id, author_id: owner });
    if (deleted.length !== 1 || deleted[0] !== id) {
      res.status(409).json({ error: "Skill changed or is no longer available" }); return;
    }
    res.json({ ok: true });
  } catch (err) {
    // Database bodies can contain private record details; never log or return them.
    if (err instanceof SupabaseError) res.status(502).json({ error: "Skill storage unavailable" });
    else res.status(500).json({ error: "Failed to delete skill" });
  }
});

export default router;
