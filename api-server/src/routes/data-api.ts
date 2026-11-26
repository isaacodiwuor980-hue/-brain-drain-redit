/**
 * api-server/src/routes/data-api.ts — Public Data API for AI labs.
 *
 * GET /api/v1/datasets
 *   Returns the list of available datasets for AI training/licensing.
 *   Each dataset describes its license, record count, and quality metrics.
 *
 * GET /api/v1/search?q=...
 *   Semantic search across all public records. Returns JSON results
 *   with provenance + confidence scores. This is what makes MindSpool
 *   outperform Google for expert knowledge — structured, verified,
 *   confidence-scored answers instead of SEO-optimized blog posts.
 *
 * Removed in Phase 3 (S-3): GET /api/v1/health/detailed — publicly exposed
 * memory usage, environment, and feature flags. Ops introspection should
 * live behind auth or a private monitoring network, not on the public API.
 */
import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── /api/v1/datasets ─────────────────────────────────────────────

router.get("/v1/datasets", (_req, res) => {
  // The datasets endpoint describes WHAT data is available, not the
  // data itself. AI labs use this to decide whether to license.
  // When the server-side store lands, these counts will be real.
  res.json({
    platform: "MindSpool",
    description: "Human-verified knowledge with provenance chains, confidence scores, and per-record licensing.",
    datasets: [
      {
        id: "drain-entries",
        name: "Drained expert minds",
        description: "Lifelong timeline of expert techniques, secrets, and mentorship lessons. Each entry has a SHA-256 provenance chain and a legacy/will status.",
        recordCount: "dynamic",
        license: "per-record (CC0 / CC-BY / CC-BY-SA / CC-BY-NC / proprietary)",
        quality: {
          provenance: "SHA-256 chained hashes, per-record linked list",
          verification: "3 tiers (anonymous / identity / credential)",
          confidence: "0-100 score, transparent formula",
          disputes: "public moderation log, 5-state workflow",
        },
        access: "API key required for bulk access. Single-record access via /verify/record/:id.",
      },
      {
        id: "qa-answers",
        name: "Q&A answers with confidence scores",
        description: "Every answer has a 0-100 confidence score computed from confirmations, citations, contributor reputation, disputes, and provenance integrity.",
        recordCount: "dynamic",
        license: "per-record",
        quality: {
          provenance: "SHA-256 chained hashes",
          confidence: "transparent 5-component formula (confirmations 40 + citations 20 + reputation 20 + disputes -30 + provenance 5)",
          ranking: "gravity formula: (UserTopicScore * 12 + NetVotes * 2 + SourceLinks * 25) / ((DaysOld + 1) ^ 0.55)",
        },
        access: "API key required. Search via /api/v1/search?q=...",
      },
      {
        id: "verification-records",
        name: "Contributor verification records",
        description: "Public verification status for every contributor — tier, credentials, proof history. PII is hashed (SHA-256), never stored raw.",
        recordCount: "dynamic",
        license: "public (no license required for verification status)",
        quality: {
          tiers: "anonymous / identity / credential",
          sybilResistance: "proof-hash deduplication detects same-human-multiple-accounts",
        },
        // B-13 fix: removed reference to /api/v1/verify/:userId (501 stub).
        // Verification status will be queryable here once the verify route
        // is implemented; until then, the dataset description is the contract.
        access: "Public via this API (endpoint pending implementation).",
      },
    ],
    licensing: {
      portal: "Contact licensing@MindSpool.app for API keys",
      pricing: "Per-dataset, based on record count + license terms",
      trial: "Free tier: 100 API calls/day for evaluation",
    },
    generatedAt: new Date().toISOString(),
  });
});

// ── /api/v1/search ───────────────────────────────────────────────

router.get("/v1/search", (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query) {
    res.status(400).json({
      error: "Missing query parameter 'q'. Example: /api/v1/search?q=how+to+diagnose+memory+leak",
    });
    return;
  }
  if (query.length > 500) {
    res.status(400).json({ error: "Query too long (max 500 chars)." });
    return;
  }

  // In a production deployment with a server-side data store, this
  // would do a real semantic search (embeddings + vector DB). For now
  // it returns the search contract + a placeholder so AI labs can
  // integrate against the API shape.
  res.json({
    query,
    results: [],
    resultCount: 0,
    contract: {
      results: "Array<{ recordId, kind, title, snippet, confidenceScore, provenanceValid, authorTier, license, url }>",
      confidenceScore: "0-100 (see /data-quality for formula)",
      provenanceValid: "boolean (true if SHA-256 chain is intact)",
      authorTier: '"anonymous" | "identity" | "credential"',
      license: '"CC0" | "CC-BY" | "CC-BY-SA" | "CC-BY-NC" | "proprietary"',
      url: "canonical URL to the record's SSR page",
    },
    note: "Server-side search index pending. The search contract is stable — integrate against this shape and real results will populate when the server-side store lands.",
    generatedAt: new Date().toISOString(),
  });
});

// /api/v1/health/detailed was removed in Phase 3 (S-3): it publicly exposed
// memory usage, environment, and feature flags. Use the authenticated ops
// dashboard or /api/healthz (liveness, no internals) instead.

export default router;
