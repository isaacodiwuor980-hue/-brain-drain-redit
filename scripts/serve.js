/* Permanent preview-server resilience wrapper.
 *
 * WHY THIS EXISTS:
 *   The bare `node dist/server.cjs` dies on any unhandled crash (a stray
 *   rejection, a port conflict, an OOM). When that happens mid-session the
 *   preview goes blank and the only recovery is a manual restart — which is
 *   exactly the frustration this fixes. This wrapper respawns the server on
 *   any non-zero / abnormal exit, with a bounded restart budget so a real bug
 *   surfaces instead of looping forever, and forwards signals cleanly so a
 *   single Ctrl-C tears the whole tree down.
 *
 *   NOTE (honest limitation): this wrapper fixes CRASH deaths. It cannot fix
 *   the sandbox reaping ALL background processes when a turn ends — that is
 *   an environment-level lifecycle the user's preview runner must own. Run
 *   `npm start` from a persistent terminal / process manager (pm2, systemd,
 *   Docker, a host platform) for a preview that survives across sessions.
 *
 * Usage:  npm start            (production, auto-restart)
 *         node scripts/serve.js
 * Env:    PORT (default 3000)   NODE_ENV (default production)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "dist", "server.cjs");
const INDEX = join(ROOT, "dist", "index.html");

/**
 * Ensure the production build exists before serving. On a fresh clone this
 * lets `npm install && npm start` work without remembering `npm run build`
 * first; if the build is already present (the normal case) this is a no-op.
 */
function ensureBuild() {
  if (existsSync(SERVER) && existsSync(INDEX)) return;
  console.log("[serve] dist/ missing or incomplete — running `npm run build`…");
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmBin, ["run", "build"], {
    stdio: "inherit",
    cwd: ROOT,
  });
  if (result.status !== 0) {
    console.error(
      `[serve] build failed (exit ${result.status}). Run \`npm run build\` manually to see the error.`,
    );
    process.exit(1);
  }
  if (!existsSync(SERVER) || !existsSync(INDEX)) {
    console.error(
      "[serve] build reported success but dist/server.cjs or dist/index.html is still missing — check the vite/esbuild config.",
    );
    process.exit(1);
  }
}

// Bail out after too many restarts in a short window — that's a real bug,
// not a transient blip, and looping forever would hide it.
const MAX_RESTARTS = 12;
const WINDOW_MS = 60_000;
const BACKOFF_MS = 1000;

const births = [];
let stopping = false;
let child = null;

function spawnServer() {
  child = spawn(process.execPath, [SERVER], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    // Clean shutdown signals — don't respawn.
    if (signal === "SIGINT" || signal === "SIGTERM") return;
    if (code === 0) return;

    const now = Date.now();
    births.push(now);
    while (births.length && births[0] < now - WINDOW_MS) births.shift();
    if (births.length > MAX_RESTARTS) {
      console.error(
        `[serve] ${births.length} crashes in ${WINDOW_MS / 1000}s — giving up to avoid a restart loop. ` +
          `Read the server output above for the root cause.`,
      );
      process.exit(1);
    }
    console.error(
      `[serve] server exited (code=${code} signal=${signal || "none"}) — respawning in ${BACKOFF_MS}ms…`,
    );
    setTimeout(spawnServer, BACKOFF_MS);
  });
}

function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  console.log(`[serve] ${sig} received — stopping server.`);
  if (child) {
    try {
      child.kill(sig);
    } catch {
      /* child already gone */
    }
  }
  // Give the child a moment to drain, then exit.
  setTimeout(() => process.exit(0), 200);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

ensureBuild();
spawnServer();
