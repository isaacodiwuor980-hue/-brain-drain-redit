// Load .env into process.env BEFORE any other import reads env vars.
// Must be the very first import so config.ts / supabase.ts see the values.
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "node:fs";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import apiApp from "./api-server/src/app";
import { renderDataQualityPage } from "./lib/data-quality-page";
import { isPrivateBuildArtifact } from "./lib/static-artifact-policy";
import { initSentry, captureException, sentryRequestHandler, sentryErrorHandler } from "./api-server/src/lib/sentry";

async function startServer() {
  // Phase 8 — Sentry error tracking (no-op when SENTRY_DSN is unset).
  initSentry();

  const app = express();
  // F1: Read PORT from env (matching api-server/src/lib/config.ts validation)
  // with a 3000 fallback so local `node dist/server.cjs` still works without
  // an env var. Previously this was hardcoded to 3000, which broke PaaS
  // deploys (Render, Railway, Fly) that inject PORT=8080 etc.
  const rawPort = process.env.PORT;
  const PORT = rawPort ? Number(rawPort) : 3000;
  if (!Number.isFinite(PORT) || PORT <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  // Security headers on ALL responses (SSR pages + API + static).
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.space-z.ai http://*.space-z.ai http://localhost:* https://localhost:*;",
    );
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.removeHeader("X-Powered-By");
    next();
  });

  // PERF: brotli/gzip compression for ALL responses. Without this, assets
  // are sent UNCOMPRESSED — the 190 KB index chunk transfers as 190 KB
  // instead of ~44 KB. Threshold 1 KB so tiny responses skip the overhead.
  app.use(
    compression({
      threshold: 1024,
      level: 6,
      filter: (req, res) => {
        const contentType = res.getHeader("Content-Type") || "";
        if (typeof contentType === "string" && /^(image\/|font\/|application\/(zip|gzip))/.test(contentType)) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  // PWA: serve .webmanifest with the correct MIME type so Chrome recognizes
  // the manifest for installability checks.
  app.use((req, res, next) => {
    if (req.path.endsWith(".webmanifest")) {
      res.type("application/manifest+json");
    }
    next();
  });

  // Mount API routes BEFORE Vite middleware. Sentry request handler first
  // (no-op when SENTRY_DSN unset) so it can capture tracing data.
  app.use(sentryRequestHandler());

  // B-4 + B-14 fix: maintenance-mode gate MUST mount BEFORE apiApp so it
  // actually gates API traffic (previously it mounted AFTER apiApp, so
  // /api/* requests bypassed it entirely). It also now reads MAINTENANCE_MODE
  // per-request (hot-reload) instead of once at boot, so operators can flip
  // it during an incident without restarting the server. /api/healthz is
  // always exempt so load balancers still see liveness.
  app.use((req, res, next) => {
    if (process.env.MAINTENANCE_MODE === "true" && req.path !== "/api/healthz") {
      res.status(503).json({ error: "Maintenance in progress." });
      return;
    }
    next();
  });

  app.use(apiApp);

  // SSR routes
  app.get("/sitemap.xml", (_req, res) => {
    const origin = `${_req.protocol}://${_req.get("host")}`;
    const now = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: "/", priority: "1.0", changefreq: "hourly", lastmod: now },
      { loc: "/data-quality", priority: "0.9", changefreq: "daily", lastmod: now },
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${origin}${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join("\n")}
</urlset>`;
    res.type("xml").send(xml);
  });

  app.get("/llms.txt", (_req, res) => {
    // B-13 fix: removed dead links to /verify/:userId, /brain/:brainId,
    // /verify/record/:recordId — none of these SSR routes exist (the
    // verify/provenance API routers were removed entirely in Phase 3, not
    // merely stubbed). Advertising them in llms.txt pointed LLMs/crawlers
    // at 404s. Only list real pages.
    const origin = `${_req.protocol}://${_req.get("host")}`;
    res.type("text/plain").send(`# Brain Drain\n\n> A human knowledge engine.\n\n## Crawlable pages\n- ${origin}/\n- ${origin}/data-quality\n`);
  });

  app.get("/data-quality", (_req, res) => {
    const origin = `${_req.protocol}://${_req.get("host")}`;
    res.type("html").send(renderDataQualityPage({ origin }));
  });

  // Vite middleware for development / static serving for production.
  // The run mode is set by the npm script (dev → development, start →
  // production); dotenv never overrides an already-set process.env value,
  // so this branch is deterministic regardless of .env contents.
  if (process.env.NODE_ENV !== "production") {
    let vite;
    try {
      vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    } catch (err) {
      // A failed Vite startup makes the dev server useless (every route
      // would 404). Fail loudly with an actionable message instead of
      // limping along serving nothing.
      console.error("FATAL: Vite dev server failed to start:", err);
      console.error('Fix: clear the cache with "rm -rf node_modules/.vite" then "npm run dev".');
      process.exit(1);
    }
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Guard: a missing/stale build is the #1 cause of "preview down" —
    // fail loudly at startup with an actionable message instead of
    // silently 404-ing every route.
    const indexHtml = path.join(distPath, "index.html");
    if (!fs.existsSync(indexHtml)) {
      throw new Error(
        `Production build not found at ${indexHtml}.\n` +
          'Run "npm run build" before "npm start", or use "npm run dev" for live development.',
      );
    }
    // dotfiles: "allow" — required so /.well-known/assetlinks.json is served
    // (Express defaults to "ignore" for dotfiles, which would 404 and fall
    // through to the SPA catch-all, breaking TWA verification).
    //
    // BUG #2 FIX — `immutable, max-age=1y` was applied to EVERYTHING under
    // dist/, including un-hashed files copied verbatim from public/
    // (manifest.webmanifest, favicon.svg, icon-*.png, sw-killer.js,
    // crypto-polyfill.js, robots.txt). Those names are stable across deploys,
    // so browsers/CDNs would serve a year-old manifest, a stale icon, or — far
    // worse — an OLD sw-killer.js that no longer unregisters a stale service
    // worker. Only Vite's content-hashed output (assets/<name>-<hash>.js) is
    // safe to pin forever; everything else must revalidate.
    // The build places the Node bundle alongside browser assets. Never serve
    // server code or source maps through this Express static host.
    app.use((req, res, next) => {
      if (!isPrivateBuildArtifact(req.path)) return next();
      res.setHeader("Cache-Control", "no-store");
      return res.status(404).type("text/plain").send("Not found");
    });
    app.use(
      express.static(distPath, {
        index: false,
        dotfiles: "allow",
        setHeaders(res, filePath) {
          const relative = path.relative(distPath, filePath).split(path.sep).join("/");
          const isHashedAsset =
            relative.startsWith("assets/") && /-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|avif)$/.test(relative);
          if (isHashedAsset) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (relative.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          } else {
            // Stable filenames: let the browser keep a copy but always
            // revalidate, so a deploy is picked up on the next load.
            res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
          }
        },
      }),
    );
    // HTML must never be cached (fresh preview)
    app.get("/", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
    // B-7 fix: unmatched /api/* paths used to fall through to the SPA
    // catch-all below and return index.html (200 HTML), which broke API
    // clients expecting JSON. Now we 404 with a JSON body BEFORE the SPA
    // catch-all. Non-/api paths still get the SPA (client-side routing).
    app.use("/api", (_req, res) => {
      res.status(404).json({ error: "Not found" });
    });
    // SPA catch-all (Express 5 needs named wildcard)
    app.use((_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Sentry error capture — registered LAST (express error-middleware
  // convention). No-op unless SENTRY_DSN is set (see api-server/src/lib/sentry).
  app.use(sentryErrorHandler());

  // Graceful shutdown
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // PERF: pre-warm the in-memory feed cache. The feed route's SWR cache
    // lives in module memory, so it is wiped on every restart — and the
    // container recycles (restarting the server) constantly. Without warmup,
    // the first visitor after every recycle paid the full cold-cache cost
    // (~2.4s: two sequential Supabase round trips for posts + reactions).
    // Warming both feed modes here means that visitor gets a HIT (~1ms).
    // Fire-and-forget: must NEVER block startup or crash the server if
    // Supabase is briefly unavailable. Verified 2026-11-14.
    for (const mode of ["foryou", "following"] as const) {
      const warmupUrl = `http://localhost:${PORT}/api/feed?mode=${mode}&limit=20`;
      fetch(warmupUrl).catch((err) => {
        console.warn(`[warmup] feed pre-fetch (${mode}) failed (non-fatal):`, err);
      });
    }
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received — shutting down gracefully…`);
    server.close((err) => {
      if (err) { console.error("Error closing server:", err); process.exit(1); }
      console.log("All connections closed.");
      process.exit(0);
    });
    setTimeout(() => { process.exit(1); }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err);
    // Phase 8 — report to Sentry (no-op when SENTRY_DSN unset).
    captureException(err);
    // Don't exit — log and continue. Many Express async route rejections
    // surface here, and killing the server on every transient API error
    // would make the app unusable. Real fatal errors (out of memory, etc.)
    // will crash naturally via the OS.
  });
  process.on("unhandledRejection", (reason) => {
    console.error("unhandledRejection:", reason);
    // Phase 8 — report to Sentry (no-op when SENTRY_DSN unset).
    captureException(reason);
    // Don't exit — same rationale. Express route handlers that throw
    // async errors land here. Log + continue so the server stays up.
  });
}

startServer();
