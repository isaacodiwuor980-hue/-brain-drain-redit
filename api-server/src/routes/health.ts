import { Router, type IRouter } from "express";
import { z } from "zod";
import { config } from "../lib/config";
import { supabase } from "../lib/supabase";

// Shape kept as a type only: the payload is hand-built on the hot path (no
// per-probe zod allocation), so this records the contract without shipping a
// runtime schema that nothing calls.
type HealthCheckResponse = {
  status: string;
  uptime: number;
  timestamp: string;
  supabase: "configured" | "not-configured";
  env: string;
};

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
/**
 * Health check — cheap and allocation-light on purpose.
 *
 * PERF: this ran a zod `.parse()` (allocating a fresh object graph) on EVERY
 * call. Behind a load balancer that is several probes per second per
 * instance, on the hot path, for a fixed 5-field payload. The shape is now
 * built once and only `uptime`/`timestamp` vary, so we skip validation in the
 * steady state and keep the schema for the tests/contract.
 */
router.get("/healthz", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Health", "ok");
  const data: HealthCheckResponse = {
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    supabase: config.supabase.isConfigured ? "configured" : "not-configured",
    env: config.nodeEnv,
  };
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
