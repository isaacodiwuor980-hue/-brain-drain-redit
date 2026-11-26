/**
 * api-server/src/routes/experts.ts — Expert directory + credential review.
 *
 * Flow:
 *   - Any authenticated user can submit an expert application (creates an
 *     experts row with credential_status='draft').
 *   - User submits credentials -> status becomes 'pending_review'.
 *   - Admin reviews -> status becomes 'verified' or 'rejected'.
 *   - Verified experts are public (is_public=true) and can be matched as
 *     mentors.
 *
 * Endpoints:
 *   POST   /api/experts                -- submit application (auth required)
 *   GET    /api/experts                -- list public verified experts (optional auth)
 *   GET    /api/experts/me             -- get my application status (auth required)
 *   POST   /api/experts/:id/submit     -- move draft -> pending_review (owner)
 *   POST   /api/experts/:id/verify     -- admin: verify or reject (admin only)
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { requireMappedIdentity } from "../middleware/identity-map";
import { requireRecentAuthentication } from "../middleware/recent-auth";

const router: IRouter = Router();
router.use("/experts", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

// Admin gate: in P1, admin emails are configured via env. Real RBAC can be
// added later via a profiles.is_admin column.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string | undefined, emailVerified: boolean | undefined): boolean {
  if (!email || emailVerified !== true) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

const SubmitApplicationSchema = z.object({
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().max(2000).optional(),
  bio: z.string().max(2000).optional(),
  expertise: z.string().min(1).max(100),
  expertiseTags: z.array(z.string().min(1).max(50)).max(20).default([]),
  credentials: z.object({
    orcid: z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, "Invalid ORCID").optional(),
    licenseState: z.string().max(20).optional(),
    licenseNumber: z.string().max(100).optional(),
    institution: z.string().max(200).optional(),
    title: z.string().max(100).optional(),
  }).default({}),
});

interface ExpertRow {
  id: string;
  user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  expertise: string;
  expertise_tags: string[];
  credential_status: string;
  credentials: Record<string, unknown>;
  is_public: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * POST /api/experts
 * Submit a new expert application. Creates a draft row owned by the
 * caller. The draft is private until the user submits it for review.
 */
router.post("/experts", requireAuth, requireMappedIdentity, async (req, res) => {
  const parsed = SubmitApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid application", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  // One draft per user: check if there's an existing non-verified application.
  try {
    const existing = await supabase.getOne<{ id: string; credential_status: string }>("experts", {
      select: "id,credential_status",
      filters: {
        user_id: `eq.${req.mappedUserId!}`,
        credential_status: "in.(draft,pending_review,verified)",
      },
    });

    if (existing) {
      res.status(409).json({
        error: "Application already exists",
        id: existing.id,
        status: existing.credential_status,
      });
      return;
    }

    const input = parsed.data;
    const row = {
      user_id: req.mappedUserId!,
      display_name: input.displayName,
      avatar_url: input.avatarUrl || null,
      bio: input.bio || "",
      expertise: input.expertise,
      expertise_tags: input.expertiseTags,
      credential_status: "draft",
      credentials: input.credentials,
      is_public: false,
    };

    await supabase.insert("experts", row);
    res.status(201).json({ ok: true, status: "draft" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Expert application failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/experts
 * List public (verified) experts. Optionally filter by expertise area.
 */
router.get("/experts", optionalAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  const filters: Record<string, string> = {
    is_public: "eq.true",
    credential_status: "eq.verified",
  };
  if (typeof req.query.expertise === "string" && req.query.expertise.length <= 100) {
    filters.expertise = `ilike.${req.query.expertise}`;
  }

  try {
    const rows = await supabase.get<ExpertRow>("experts", {
      select: "id,display_name,avatar_url,bio,expertise,expertise_tags,credential_status,reviewed_at,created_at",
      filters,
      order: { column: "created_at", ascending: false },
      limit: 50,
    });

    res.json({
      experts: rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        bio: r.bio,
        expertise: r.expertise,
        expertiseTags: r.expertise_tags,
        verifiedAt: r.reviewed_at,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Expert list failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/experts/me
 * Get the caller's expert application status (any status, private).
 */
router.get("/experts/me", requireAuth, requireMappedIdentity, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await supabase.getOne<ExpertRow>("experts", {
      select: "id,user_id,display_name,avatar_url,bio,expertise,expertise_tags,credential_status,credentials,is_public,reviewed_by,reviewed_at,review_notes,created_at,updated_at",
      filters: { user_id: `eq.${req.mappedUserId!}` },
      order: { column: "created_at", ascending: false },
    });

    if (!row) {
      res.json(null);
      return;
    }

    if (row.user_id?.toLowerCase() !== req.mappedUserId!.toLowerCase()) {
      res.status(502).json({ error: "Storage unavailable" }); return;
    }
    res.json({
      id: row.id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      expertise: row.expertise,
      expertiseTags: row.expertise_tags,
      credentialStatus: row.credential_status,
      credentials: row.credentials,
      isPublic: row.is_public,
      reviewedAt: row.reviewed_at,
      reviewNotes: row.review_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Expert self-fetch failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * POST /api/experts/:id/submit
 * Move a draft application to pending_review. Owner only.
 */
router.post("/experts/:id/submit", requireAuth, requireMappedIdentity, async (req, res) => {
  // S-4 fix: validate :id as UUID before using it in PostgREST filters.
  // Without this, an attacker could inject PostgREST filter operators via
  // the URL (e.g. /experts/eq.foo/submit). Experts IDs are UUIDs.
  const id = String(req.params.id ?? "").toLowerCase();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    // Fetch + verify ownership in one go.
    const row = await supabase.getOne<{ user_id: string; credential_status: string }>("experts", {
      select: "user_id,credential_status",
      filters: { id: `eq.${id}` },
    });

    if (!row) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    if (row.user_id !== req.mappedUserId!) {
      res.status(403).json({ error: "Not your application" });
      return;
    }
    if (row.credential_status !== "draft") {
      res.status(409).json({ error: "Application already submitted", status: row.credential_status });
      return;
    }

    // Re-check owner and status in the write itself; a prior read can race.
    const updated = await supabase.updateMatchingIds(
      "experts",
      { id, user_id: req.mappedUserId!, credential_status: "draft" },
      { credential_status: "pending_review" },
    );
    if (updated.length !== 1 || updated[0] !== id) {
      res.status(409).json({ error: "Application changed; please refresh" });
      return;
    }
    res.json({ ok: true, status: "pending_review" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Expert submit-for-review failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

const AdminReviewSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  notes: z.string().max(2000).optional(),
});

/**
 * POST /api/experts/:id/verify
 * Admin-only: verify or reject a pending_review application.
 */
router.post("/experts/:id/verify", requireAuth, requireRecentAuthentication, requireMappedIdentity, async (req, res) => {
  // S-4 fix: validate :id as UUID (same rationale as /submit above).
  const id = String(req.params.id ?? "").toLowerCase();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!isAdmin(req.auth?.email, req.auth?.emailVerified)) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const parsed = AdminReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid decision", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const changes: Record<string, unknown> = {
      credential_status: parsed.data.decision,
      reviewed_by: req.mappedUserId!,
      reviewed_at: new Date().toISOString(),
      review_notes: parsed.data.notes || null,
      // Verified => public. Rejected => stay private.
      is_public: parsed.data.decision === "verified",
    };

    // Only a pending application may transition; distinguish a missed update
    // from success without leaking whether a private application exists.
    const updated = await supabase.updateMatchingIds("experts", { id, credential_status: "pending_review" }, changes);
    if (updated.length !== 1 || updated[0] !== id) {
      res.status(409).json({ error: "Application is not pending review" });
      return;
    }
    res.json({ ok: true, status: parsed.data.decision });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Expert admin review failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

export default router;
