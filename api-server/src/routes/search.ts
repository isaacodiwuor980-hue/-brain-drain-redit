import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import type { SkillRow } from "./skills";

const router: IRouter = Router();

/**
 * Part 2 Task 6: three-layer search.
 *
 * 1. Rule filters — plain SQL WHERE clauses on Skill ID fields (domain, make,
 *    model, year, part). These run FIRST and narrow the candidate set.
 * 2. Keyword search — Postgres full-text search (ts_rank) for exact
 *    procedural/technical terms. This is the BM25-style layer.
 * 3. Semantic search — pgvector cosine similarity on an embedding column.
 *    Only runs if pgvector is installed + the skills table has an embedding
 *    column. Gracefully degrades if not.
 *
 * ASSUMPTION (flagged): the project's backend planning docs reference pgvector
 * as a future option. This route checks for pgvector at query time and skips
 * the semantic layer if the extension or embedding column isn't available,
 * rather than failing. The rule + keyword layers always work as long as
 * Supabase is configured.
 */

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  // Rule filters (Task 6 layer 1) — all optional.
  domain: z.string().max(50).optional(),
  make: z.string().max(50).optional(),
  model: z.string().max(50).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  part: z.string().max(100).optional(),
  // Which layers to run.
  layers: z.enum(["all", "rule_keyword", "rule_only"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get("/v1/search/skills", async (req, res) => {
  const parsed = SearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid search query", details: parsed.error.flatten() });
    return;
  }

  const { q, domain, make, model, year, part, layers, limit } = parsed.data;

  // An outage or missing configuration is not a verified empty result.
  if (!supabase.isConfigured()) {
    res.set("Cache-Control", "no-store").status(503).json({ error: "Skill search is temporarily unavailable." });
    return;
  }

  try {
    // ── Layer 1: Rule filters (SQL WHERE on Skill ID fields) ──────────
    // These narrow the candidate set before the ranked layers run.
    // This route is public and the service-role client bypasses RLS.
    // Never request unpublished skills from the database.
    const filters: Record<string, string> = { status: "eq.published" };
    if (domain) filters.domain = `eq.${domain.toUpperCase()}`;
    if (make) filters.make = `eq.${make.toUpperCase()}`;
    if (model) filters.model = `eq.${model.toUpperCase()}`;
    if (year) filters.year = `eq.${year}`;
    if (part) filters.part = `eq.${part.toUpperCase()}`;

    // ── Layer 2: Keyword search (Postgres FTS / ts_rank) ──────────────
    // B-5 fix: previously this block built a `supabase.get(...)` Promise and
    // then REASSIGNED it to a second `supabase.get(...)` when `q` was present.
    // The first Promise was already constructed (HTTP request fired to
    // Supabase) but its result was discarded — doubling the Supabase quota
    // usage on every keyword search and adding a wasted network round-trip.
    // Now we build the query options ONCE and call supabase.get ONCE.
    const baseSelect = "id,title,domain,make,model,year,part,version,author_name,author_years_experience,status";
    const queryFilters: Record<string, string> = { ...filters };
    if (q && layers !== "rule_only") {
      // FTS on title — this is the BM25-style keyword layer.
      // PostgREST maps `fts` to `to_tsvector @@ plainto_tsquery`.
      queryFilters.title = `fts.${q}`;
    }
    const queryOptions: {
      select: string;
      filters: Record<string, string>;
      order: { column: string; ascending: boolean };
      limit: number;
    } = {
      select: baseSelect,
      filters: queryFilters,
      order: { column: "created_at", ascending: false },
      limit: layers === "rule_only" ? limit : limit * 2, // over-fetch for semantic re-rank
    };

    let keywordResults: SkillRow[] = [];
    try {
      keywordResults = await supabase.get<SkillRow>("skills", queryOptions);
    } catch {
      logger.warn("Skill keyword search unavailable");
      res.set("Cache-Control", "no-store").status(503).json({ error: "Skill search is temporarily unavailable." });
      return;
    }

    // ── Layer 3: Semantic search (pgvector) ───────────────────────────
    // SKIPPED in current build. The match_skills RPC requires a
    // query_embedding vector(1536), but the API server doesn't have
    // a Gemini embedding client wired up. To enable semantic search,
    // a future task would: (a) call Gemini text-embedding-004 to get
    // the query embedding, (b) pass it to match_skills via RPC.
    // For now, layer 1 (rule) + layer 2 (FTS) cover the use cases.
    const semanticResults: SkillRow[] = [];

    // Merge + dedupe: semantic results first (re-ranked), then keyword results.
    // Merged entries carry the layer they came from so the response can
    // report matchLayer per result.
    const seen = new Set<string>();
    const merged: (SkillRow & { _layer: "semantic" | "keyword" })[] = [];
    for (const r of semanticResults) {
      if (r.status !== "published") continue;
      if (!seen.has(r.id)) {
        seen.add(r.id);
        merged.push({ ...r, _layer: "semantic" });
      }
    }
    for (const r of keywordResults) {
      if (r.status !== "published") continue;
      if (!seen.has(r.id)) {
        seen.add(r.id);
        merged.push({ ...r, _layer: "keyword" });
      }
    }

    const results = merged.slice(0, limit).map((r) => ({
      recordId: r.id,
      kind: "skill",
      title: r.title,
      domain: r.domain,
      make: r.make,
      model: r.model,
      year: r.year,
      part: r.part,
      version: r.version,
      authorName: r.author_name,
      authorYearsExperience: r.author_years_experience,
      status: r.status,
      matchLayer: r._layer,
    }));

    res.json({
      query: q,
      filters: { domain, make, model, year, part },
      layers,
      results,
      resultCount: results.length,
      layersUsed: {
        rule: true,
        keyword: layers !== "rule_only",
        semantic: layers === "all" && semanticResults.length > 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch {
    logger.error("Skill search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
