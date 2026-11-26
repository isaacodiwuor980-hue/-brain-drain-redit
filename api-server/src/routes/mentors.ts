/**
 * api-server/src/routes/mentors.ts — Mentor-mentee pairing.
 *
 * Lifecycle: requested -> accepted -> active -> completed
 *                           |              |
 *                           v              v
 *                       declined       cancelled
 *
 * Mutations are currently paused by the router-level gate below.
 * Endpoints:
 *   POST   /api/mentors              -- mentee requests a mentor (auth)
 *   GET    /api/mentors/me/mentee    -- my mentorship records as mentee (auth)
 *   GET    /api/mentors/me/mentor    -- my mentorship records as mentor (auth)
 *   POST   /api/mentors/:id/accept   -- mentor accepts a request (auth, mentor only)
 *   POST   /api/mentors/:id/start    -- mentor marks active (auth, mentor only)
 *   POST   /api/mentors/:id/complete -- either party completes (auth)
 *   POST   /api/mentors/:id/decline  -- mentor declines request (auth, mentor only)
 *   POST   /api/mentors/:id/cancel   -- either party cancels (auth)
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { requireMappedIdentity } from "../middleware/identity-map";

const router: IRouter = Router();
// The service client bypasses RLS. Identity must be resolved before every
// mentorship route, and private responses must not be cached.
router.use("/mentors", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, requireAuth, requireMappedIdentity);
// Legacy mutations use read-then-update without owner/status preconditions,
// double-prefix filters and lack retry receipts. Preserve them below for review
// but never invoke them while the authoritative workflow is unverified.
router.use("/mentors", (req, res, next) => {
  if (req.method === "POST") { res.status(503).json({ error: "Mentorship changes temporarily unavailable" }); return; }
  next();
});

const RequestSchema = z.object({
  expertId: z.string().uuid(),
  topicId: z.string().max(80).optional(),
  goal: z.string().max(2000).optional(),
  endsAt: z.string().datetime().optional(),
});

interface MentorRow {
  id: string;
  expert_id: string;
  mentor_user_id: string;
  mentee_user_id: string;
  topic_id: string | null;
  status: string;
  goal: string | null;
  started_at: string | null;
  ends_at: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  created_at: string;
}

function serialize(r: MentorRow) {
  return {
    id: r.id,
    expertId: r.expert_id,
    mentorUserId: r.mentor_user_id,
    menteeUserId: r.mentee_user_id,
    topicId: r.topic_id,
    status: r.status,
    goal: r.goal,
    startedAt: r.started_at,
    endsAt: r.ends_at,
    completedAt: r.completed_at,
    completionNotes: r.completion_notes,
    createdAt: r.created_at,
  };
}

/**
 * POST /api/mentors
 * Mentee requests a mentor. The mentor_user_id is derived from the expert
 * record (verified experts only).
 */
router.post("/mentors", requireAuth, async (req, res) => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    // Look up the expert to get mentor_user_id and verify they're verified.
    const expert = await supabase.getOne<{
      user_id: string | null;
      credential_status: string;
    }>("experts", {
      select: "user_id,credential_status",
      filters: { id: `eq.${parsed.data.expertId}` },
    });

    if (!expert) {
      res.status(404).json({ error: "Expert not found" });
      return;
    }
    if (expert.credential_status !== "verified") {
      res.status(409).json({ error: "Expert is not verified" });
      return;
    }
    if (!expert.user_id) {
      res.status(409).json({ error: "Expert has no associated user account" });
      return;
    }
    if (expert.user_id === req.auth!.uid) {
      res.status(400).json({ error: "Cannot mentor yourself" });
      return;
    }

    await supabase.insert("mentors", {
      expert_id: parsed.data.expertId,
      mentor_user_id: expert.user_id,
      mentee_user_id: req.auth!.uid,
      topic_id: parsed.data.topicId || null,
      status: "requested",
      goal: parsed.data.goal || null,
      ends_at: parsed.data.endsAt || null,
    });

    res.status(201).json({ ok: true, status: "requested" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentor request failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/mentors/me/mentee
 * My mentorship records as mentee.
 */
router.get("/mentors/me/mentee", async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const rows = await supabase.get<MentorRow>("mentors", {
      select: "id,expert_id,mentor_user_id,mentee_user_id,topic_id,status,goal,started_at,ends_at,completed_at,completion_notes,created_at",
      filters: { mentee_user_id: `eq.${req.mappedUserId!}` },
      order: { column: "created_at", ascending: false },
      limit: 100,
    });
    if (rows.some(row => typeof row.mentee_user_id !== "string" || row.mentee_user_id.toLowerCase() !== req.mappedUserId!.toLowerCase())) {
      res.status(502).json({ error: "Storage unavailable" }); return;
    }
    res.json({ mentorships: rows.map(serialize) });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentee fetch failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/mentors/me/mentor
 * My mentorship records as mentor.
 */
router.get("/mentors/me/mentor", async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const rows = await supabase.get<MentorRow>("mentors", {
      select: "id,expert_id,mentor_user_id,mentee_user_id,topic_id,status,goal,started_at,ends_at,completed_at,completion_notes,created_at",
      filters: { mentor_user_id: `eq.${req.mappedUserId!}` },
      order: { column: "created_at", ascending: false },
      limit: 100,
    });
    if (rows.some(row => typeof row.mentor_user_id !== "string" || row.mentor_user_id.toLowerCase() !== req.mappedUserId!.toLowerCase())) {
      res.status(502).json({ error: "Storage unavailable" }); return;
    }
    res.json({ mentorships: rows.map(serialize) });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentor fetch failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * Helper: load a mentorship row, verify the caller is a participant.
 * S-4 fix: validates mentorshipId as UUID before passing it to PostgREST
 * filters, preventing filter-injection via the URL.
 */
async function loadAndAuthorize(
  mentorshipId: string,
  userId: string,
  requireRole: "mentor" | "either",
  req: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): Promise<MentorRow | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(mentorshipId)) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  const row = await supabase.getOne<MentorRow>("mentors", {
    select: "id,expert_id,mentor_user_id,mentee_user_id,topic_id,status,goal,started_at,ends_at,completed_at,completion_notes,created_at",
    filters: { id: `eq.${mentorshipId}` },
  });

  if (!row) {
    res.status(404).json({ error: "Mentorship not found" });
    return null;
  }
  if (requireRole === "mentor" && row.mentor_user_id !== userId) {
    res.status(403).json({ error: "Mentor only" });
    return null;
  }
  if (requireRole === "either" && row.mentor_user_id !== userId && row.mentee_user_id !== userId) {
    res.status(403).json({ error: "Not a participant" });
    return null;
  }
  return row;
}

/**
 * POST /api/mentors/:id/accept
 * Mentor accepts a request. Status: requested -> accepted.
 */
router.post("/mentors/:id/accept", requireAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await loadAndAuthorize(req.params.id as string, req.auth!.uid, "mentor", req, res);
    if (!row) return;
    if (row.status !== "requested") {
      res.status(409).json({ error: "Not in requested state", status: row.status });
      return;
    }

    await supabase.update(
      "mentors",
      { id: `eq.${req.params.id as string}` },
      { status: "accepted" },
    );
    res.json({ ok: true, status: "accepted" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentor accept failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * POST /api/mentors/:id/start
 * Mentor marks active. Status: accepted -> active.
 */
router.post("/mentors/:id/start", requireAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await loadAndAuthorize(req.params.id as string, req.auth!.uid, "mentor", req, res);
    if (!row) return;
    if (row.status !== "accepted") {
      res.status(409).json({ error: "Not in accepted state", status: row.status });
      return;
    }

    await supabase.update(
      "mentors",
      { id: `eq.${req.params.id as string}` },
      {
        status: "active",
        started_at: new Date().toISOString(),
      },
    );
    res.json({ ok: true, status: "active" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentor start failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

const CompleteSchema = z.object({
  notes: z.string().max(2000).optional(),
});

/**
 * POST /api/mentors/:id/complete
 * Either party completes. Status: active -> completed.
 */
router.post("/mentors/:id/complete", requireAuth, async (req, res) => {
  const parsed = CompleteSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await loadAndAuthorize(req.params.id as string, req.auth!.uid, "either", req, res);
    if (!row) return;
    if (row.status !== "active") {
      res.status(409).json({ error: "Not in active state", status: row.status });
      return;
    }

    await supabase.update(
      "mentors",
      { id: `eq.${req.params.id as string}` },
      {
        status: "completed",
        completed_at: new Date().toISOString(),
        completion_notes: parsed.data.notes || null,
      },
    );
    res.json({ ok: true, status: "completed" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentor complete failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * POST /api/mentors/:id/decline
 * Mentor declines a request. Status: requested -> declined.
 */
router.post("/mentors/:id/decline", requireAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await loadAndAuthorize(req.params.id as string, req.auth!.uid, "mentor", req, res);
    if (!row) return;
    if (row.status !== "requested") {
      res.status(409).json({ error: "Not in requested state", status: row.status });
      return;
    }

    await supabase.update(
      "mentors",
      { id: `eq.${req.params.id as string}` },
      { status: "declined" },
    );
    res.json({ ok: true, status: "declined" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentor decline failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * POST /api/mentors/:id/cancel
 * Either party cancels. Status: accepted|active -> cancelled.
 */
router.post("/mentors/:id/cancel", requireAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await loadAndAuthorize(req.params.id as string, req.auth!.uid, "either", req, res);
    if (!row) return;
    if (row.status !== "accepted" && row.status !== "active") {
      res.status(409).json({ error: "Cannot cancel from current state", status: row.status });
      return;
    }

    await supabase.update(
      "mentors",
      { id: `eq.${req.params.id as string}` },
      { status: "cancelled" },
    );
    res.json({ ok: true, status: "cancelled" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Mentor cancel failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

export default router;
