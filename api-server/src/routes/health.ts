import { Router, type IRouter } from "express";
import { z } from "zod";
import { config } from "../lib/config";
import { supabase } from "../lib/supabase";

const HealthCheckResponse = z.object({
  status: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
  supabase: z.enum(["configured", "not-configured"]),
  env: z.string(),
});

const ReadinessResponse = z.object({
  status: z.enum(["ready", "not-ready"]),
  checks: z.object({
    server: z.enum(["ok", "fail"]),
    supabase: z.enum(["ok", "skipped", "fail"]),
  }),
  timestamp: z.string(),
});

const router: IRouter = Router();

// Liveness probe — the process is alive and responding. Load balancers
// use this to decide whether to route traffic to this instance. It must
// be cheap and never fail (otherwise the LB kills the instance).
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    supabase: config.supabase.isConfigured ? "configured" : "not-configured",
    env: config.nodeEnv,
  });
  res.json(data);
});

// Readiness probe — the process is alive AND ready to serve real requests.
// Checks that Supabase (if configured) actually responds. Use this for
// deploy-time gating: don't route traffic until /ready returns "ready".
// If Supabase is not configured (local-only mode), the check is skipped.
router.get("/ready", async (_req, res) => {
  const serverCheck: "ok" | "fail" = "ok";
  let supabaseCheck: "ok" | "skipped" | "fail" = "skipped";

  if (config.supabase.isConfigured) {
    try {
      // 2s timeout — if Supabase doesn't respond, we're not ready.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      await supabase.get("topics", { limit: 1, signal: controller.signal });
      clearTimeout(timeout);
      supabaseCheck = "ok";
    } catch {
      supabaseCheck = "fail";
    }
  }

  const ready = serverCheck === "ok" && supabaseCheck !== "fail";
  const data = ReadinessResponse.parse({
    status: ready ? "ready" : "not-ready",
    checks: { server: serverCheck, supabase: supabaseCheck },
    timestamp: new Date().toISOString(),
  });
  res.status(ready ? 200 : 503).json(data);
});

export default router;
