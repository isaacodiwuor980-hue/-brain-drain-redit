import { Router, type IRouter } from "express";

const router: IRouter = Router();

// No event types are safe to ingest until untrusted identifiers, routes,
// arbitrary payloads, consent, retention and all storage sinks are reviewed.
// Reject explicitly so clients do not report these events as stored. A 403 also
// prevents the current client from automatically retrying a permanently gated
// batch. This does not remove existing telemetry or secure direct DB writers.
router.post("/events", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(403).json({ accepted: 0, error: "Analytics temporarily unavailable" });
});

export default router;
