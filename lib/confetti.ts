/**
 * lib/confetti.ts — lightweight canvas confetti for variable-reward votes.
 *
 * Design constraints (APEX-OMEGA):
 *  - ZERO dependencies. No canvas-confetti npm package. We draw our own
 *    particles on a single shared canvas so we never allocate more than
 *    one canvas element per page.
 *  - 120fps-capable: uses requestAnimationFrame, cancels when no particles
 *    remain (no idle rAF loop draining battery).
 *  - Respects prefers-reduced-motion: returns immediately, no particles.
 *  - Respects navigator.connection.saveData: returns immediately on 2G/save-data.
 *  - Respects low battery (<15%): returns immediately.
 *  - Max 80 particles per burst (Performance budget on mid-tier Android).
 *  - Auto-cleanup: canvas is removed from DOM after the last particle dies.
 *  - Pointer-events: none on the canvas so it never blocks taps mid-burst.
 */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  life: number; // 0..1, dies at 0
  decay: number;
  shape: "rect" | "circle";
};

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;
let activeParticles: Particle[] = [];
let rafId: number | null = null;

// APEX-OMEGA: device-capability gate. Cached for the page lifetime —
// re-checking on every vote would cost ~0.1ms but feels wasteful when
// the answer doesn't change.
let capabilityCache: { reducedMotion: boolean; saveData: boolean; lowBattery: boolean } | null = null;
function getCapabilities() {
  if (capabilityCache) return capabilityCache;
  const nav = navigator;
  capabilityCache = {
    reducedMotion:
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: typeof nav.connection?.saveData === "boolean" ? nav.connection.saveData : false,
    lowBattery: false, // populated async by Battery API if available
  };
  // Battery API is async + non-standard; best-effort, no await.
  try {
    if (typeof nav.getBattery === "function") {
      nav.getBattery().then((battery) => {
        capabilityCache!.lowBattery =
          typeof battery.level === "number" && battery.level < 0.15 && !battery.charging;
      }).catch(() => {});
    }
  } catch { /* ignore */ }
  return capabilityCache;
}

function ensureCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  if (sharedCanvas && sharedCtx && sharedCanvas.isConnected) {
    // Resize to current viewport in case the user rotated / scrolled
    sharedCanvas.width = window.innerWidth;
    sharedCanvas.height = window.innerHeight;
    return { canvas: sharedCanvas, ctx: sharedCtx };
  }
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return null;
  }
  sharedCanvas = canvas;
  sharedCtx = ctx;
  return { canvas, ctx };
}

function tick() {
  if (!sharedCtx || !sharedCanvas) {
    rafId = null;
    return;
  }
  sharedCtx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);

  // Update + draw every particle. Dead particles are filtered out.
  const next: Particle[] = [];
  for (const p of activeParticles) {
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;
    p.life -= p.decay;
    if (p.life <= 0) continue; // particle died — drop it

    sharedCtx.save();
    sharedCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
    sharedCtx.translate(p.x, p.y);
    sharedCtx.rotate(p.rotation);
    sharedCtx.fillStyle = p.color;
    if (p.shape === "circle") {
      sharedCtx.beginPath();
      sharedCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      sharedCtx.fill();
    } else {
      sharedCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    }
    sharedCtx.restore();
    next.push(p);
  }
  activeParticles = next;

  if (activeParticles.length === 0) {
    // No more particles — stop the rAF loop and remove the canvas so the
    // DOM doesn't carry an invisible full-viewport element.
    rafId = null;
    if (sharedCanvas) sharedCanvas.remove();
    sharedCanvas = null;
    sharedCtx = null;
    return;
  }
  rafId = requestAnimationFrame(tick);
}

const GOLD_PALETTE = ["#FFD700", "#FFA500", "#FFEC8B", "#FFC125", "#FFB347"];
const AMBER_PALETTE = ["#FFC107", "#FF9800", "#FFD54F", "#FFB300", "#FFE082"];

function spawnBurst(
  originX: number,
  originY: number,
  count: number,
  palette: string[],
  spread: number,
) {
  const cap = getCapabilities();
  // Hard gate: reduce-motion / save-data / low-battery users get NO confetti.
  // The haptic still fires (separately gated), so the reward isn't zero.
  if (cap.reducedMotion || cap.saveData || cap.lowBattery) return;

  const ensured = ensureCanvas();
  if (!ensured) return;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 4 + Math.random() * 6;
    activeParticles.push({
      x: originX + (Math.random() - 0.5) * 10,
      y: originY + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed * (0.5 + Math.random()),
      vy: Math.sin(angle) * speed - 3, // initial upward bias
      gravity: 0.18,
      drag: 0.985,
      size: 4 + Math.random() * 6,
      color: palette[Math.floor(Math.random() * palette.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      life: 1,
      decay: 0.008 + Math.random() * 0.008,
      shape: Math.random() < 0.5 ? "rect" : "circle",
    });
  }

  if (spread > 0) {
    // Add a few "stray" particles that fly further for a more organic burst.
    for (let i = 0; i < Math.floor(count * 0.2); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 8 + Math.random() * 6;
      activeParticles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        gravity: 0.22,
        drag: 0.99,
        size: 3 + Math.random() * 4,
        color: palette[Math.floor(Math.random() * palette.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.4,
        life: 1,
        decay: 0.01 + Math.random() * 0.01,
        shape: "circle",
      });
    }
  }

  if (rafId === null) {
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * Public API. Spawn a small amber burst (CELEBRATION tier — 4% of votes).
 * `originX/Y` should be the click location in viewport coordinates.
 */
export function spawnCelebrationBurst(originX: number, originY: number) {
  spawnBurst(originX, originY, 20, AMBER_PALETTE, 1);
}

/**
 * Public API. Spawn a large gold burst with strays (JACKPOT tier — 1% of votes).
 * This is the "WOW" moment that makes users talk about the app.
 */
export function spawnJackpotBurst(originX: number, originY: number) {
  spawnBurst(originX, originY, 60, GOLD_PALETTE, 2);
}

/**
 * Public API. Returns true if confetti is currently allowed (device capable
 * + user hasn't disabled motion). Used by callers to decide whether to also
 * fire a stronger haptic when confetti is suppressed.
 */
export function isConfettiAllowed(): boolean {
  const cap = getCapabilities();
  return !cap.reducedMotion && !cap.saveData && !cap.lowBattery;
}
