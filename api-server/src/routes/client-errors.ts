import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Untrusted messages, stacks, paths and source URLs may contain private
// content or vote data. Pause ingestion before parsing/logging until privacy,
// retention and authorized access controls have been reviewed. This does not
// protect request bodies in upstream proxies or deployed older servers.
router.post("/client-errors", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(403).json({ error: "Client error reporting unavailable" });
});

export default router;
