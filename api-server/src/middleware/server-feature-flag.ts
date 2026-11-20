import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";

/** Fail-closed server gate; browser-supplied flags and headers are ignored. */
export function requireServerFeature(name: string) {
  if (!/^[a-z0-9_]{1,80}$/.test(name)) throw new Error("Invalid feature name");
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!supabase.isConfigured()) { res.status(404).json({ error: "Feature unavailable" }); return; }
    try {
      const flag = await supabase.getOne<{ enabled: boolean }>("server_feature_flags", { select: "enabled", filters: { name: `eq.${name}` } });
      if (flag?.enabled !== true) { res.status(404).json({ error: "Feature unavailable" }); return; }
      next();
    } catch {
      res.status(503).json({ error: "Feature service unavailable" });
    }
  };
}
