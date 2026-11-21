import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";

// Call after requireAuth. Firebase subjects are not Supabase UUIDs.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { mappedUserId?: string } }
}
/** Resolve only a trusted mapping. null means unmapped; errors mean unavailable. */
export async function lookupMappedIdentity(subject: string): Promise<string | null> {
  // Restrict the PostgREST filter to avoid injecting filter syntax.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(subject)) return null;
  if (!supabase.isConfigured()) throw new Error("Identity service unavailable");
  const result = await supabase.getOne<{ supabase_uid: string }>("user_identity_map", { select: "supabase_uid", filters: { firebase_subject: `eq.${subject}` } });
  return result && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.supabase_uid) ? result.supabase_uid : null;
}

export function mappedIdentity(unmappedStatus: 401 | 403 = 403) {
  return async function requireIdentity(req: Request, res: Response, next: NextFunction): Promise<void> {
    const subject = req.auth?.uid;
    if (!subject) { res.status(401).json({ error: "Authentication required" }); return; }
    try {
      const uid = await lookupMappedIdentity(subject);
      if (!uid) { res.status(unmappedStatus).json({ error: "Identity mapping required" }); return; }
      req.mappedUserId = uid;
      next();
    } catch {
      // No identifier, token, query, or upstream body is logged.
      res.status(503).json({ error: "Identity service unavailable" });
    }
  };
}

export const requireMappedIdentity = mappedIdentity();
