/**
 * api-server/src/routes/data-api.ts — Public Data API for AI labs.
 *
 * GET /api/v1/datasets
 *   Returns the list of available datasets for AI training/licensing.
 *   Each dataset describes its license, record count, and quality metrics.
 *
 * GET /api/v1/search?q=...
 *   Semantic search across all public records. Returns JSON results
 *   with provenance + confidence scores. This is what makes Brain Drain
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
  // Existing metadata endpoint; it is not a dataset or corpus access API.
  // Metadata describes ideas only, not datasets for sale or live metrics.
  res.json({
    platform: "Brain Drain",
    status: "not yet available",
    description: "Conceptual dataset categories only; availability, verification, provenance and licensing are not established.",
    datasets: [
      {
        id: "drain-entries",
        name: "Expert knowledge entries (concept)",
        status: "not yet available",
        description: "Proposed collection of knowledge entries; coverage and provenance have not been established.",
        recordCount: "not available",
        license: "not established",
        quality: {
          provenance: "not established",
          verification: "not established",
          confidence: "not established",
          disputes: "not established",
        },
        access: "Dataset access is not available.",
      },
      {
        id: "qa-answers",
        name: "Q&A answers (concept)",
        status: "not yet available",
        description: "Proposed collection of answers; scores and provenance are not established for every answer.",
        recordCount: "not available",
        license: "not established",
        quality: {
          provenance: "not established",
          confidence: "not established",
          ranking: "not established",
        },
        access: "Dataset access is not available.",
      },
      {
        id: "verification-records",
        name: "Contributor verification records (concept)",
        status: "not yet available",
        description: "A public verification dataset and its privacy protections have not been established.",
        recordCount: "not available",
        license: "not established",
        quality: {
          tiers: "not established",
          sybilResistance: "not established",
        },
        access: "Dataset access is not available.",
      },
    ],
    licensing: {
      status: "not yet available",
      portal: "not established",
      pricing: "not established",
      trial: "not established",
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
