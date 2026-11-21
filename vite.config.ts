import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;

const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@/components": path.resolve(import.meta.dirname),
      "@": path.resolve(import.meta.dirname),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // es2020: widen runtime support to older Android WebView / Samsung
    // Internet builds (Chrome 80+, Safari 13.1+) without giving up modern
    // syntax. The Vite default target skips devices the product cares about.
    target: "es2020",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // PERF (Vite 8 / Rolldown): `manualChunks` is emulated and, verified
        // on this build, LEAKED react + react-dom into the `radix-lazy`
        // chunk: a 138 KB raw module was shipped containing a second React
        // runtime (`flushSync`, `createPortal`, the
        // "CANNOT_UPGRADE" dev strings) because ReactDOM also entered that
        // group. Root cause: react-dom / react / scheduler ids were being
        // absorbed by an earlier group before the vendor rule matched.
        // Rolldown's native `advancedChunks.groups` are evaluated in order
        // and only on modules not already claimed, so listing the React
        // runtime FIRST makes the vendor chunk authoritative.
        // (manualChunks below is kept as the fallback for non-Rolldown runs.)
        advancedChunks: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
              priority: 100,
            },
            {
              name: "firebase-firestore",
              test: /node_modules[\\/]@firebase[\\/](firestore|database)[\\/]|node_modules[\\/]firebase[\\/](firestore|database)[\\/]/,
              priority: 90,
            },
            {
              name: "firebase-auth",
              test: /node_modules[\\/](@firebase|firebase)[\\/]/,
              priority: 80,
            },
            {
              name: "tanstack",
              test: /node_modules[\\/]@tanstack[\\/]/,
              priority: 70,
            },
            {
              name: "wouter",
              test: /node_modules[\\/]wouter[\\/]/,
              priority: 60,
            },
            {
              name: "date-fns",
              test: /node_modules[\\/]date-fns[\\/]/,
              priority: 50,
            },
            // radix-shell: primitives the app shell renders immediately
            // (tooltip/dialog/dropdown/label/toast). Split so the big entry
            // chunk stays small AND these vendor bytes stay cached across
            // deploys (only the app chunk changes).
            {
              name: "radix-shell",
              test: (id: string) =>
                /node_modules[\\/]@radix-ui[\\/](react-(tooltip|alert-dialog|dialog|dropdown-menu|label|toast))[\\/]/.test(id),
              priority: 40,
            },
            {
              name: "radix-lazy",
              test: /node_modules[\\/]@radix-ui[\\/]/,
              priority: 30,
            },
          ],
        },
        // Only split vendors that are used by the eagerly-loaded app shell.
        // Heavy, route-specific libs (d3, recharts, framer-motion, firebase)
        // stay inside their lazy route chunks so they are NOT preloaded on
        // first paint — they download only when the user visits that screen.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|use-sync-external-store)\//.test(id)) {
            return "react-vendor";
          }
          if (id.includes("firebase")) {
            // PERF: split the firebase SDK by component. The whole SDK in
            // one chunk made ANY `import("firebase/auth")` pull the
            // ~800KB Firestore data layer too — a 906KB chunk downloading
            // on every first paint. Now:
            //  - firebase-firestore: the huge Firestore SDK (~800KB) — only
            //    fetched when a signed-in user's profile sync runs.
            //  - firebase-auth: app + auth + everything else (~350KB) —
            //    fetched by the on-boot session check.
            if (id.includes("@firebase/firestore") || id.includes("firebase/firestore")) {
              return "firebase-firestore";
            }
            return "firebase-auth";
          }

          // PERF: split @radix-ui into two chunks:
          //  - radix-shell: primitives used by the eagerly-loaded app shell
          //    (tooltip, alert-dialog, dialog, dropdown-menu, label, toast).
          //  - radix-lazy: all other primitives — only loaded when a route
          //    that uses them is visited.
          if (id.includes("@radix-ui")) {
            const shellPackages = [
              "react-tooltip",
              "react-alert-dialog",
              "react-dialog",
              "react-dropdown-menu",
              "react-label",
              "react-toast", // Toaster is rendered eagerly in App.tsx
            ];
            const isShell = shellPackages.some(pkg => id.includes(`/@radix-ui/${pkg}/`));
            return isShell ? "radix-shell" : "radix-lazy";
          }
          // PERF: split date-fns into its own chunk so it's NOT in the
          // critical path. 95KB gzip of date formatting code was loading
          // on every page even when the page didn't use dates. Now it
          // only loads when a route that imports date-fns is visited.
          if (id.includes("/date-fns/")) return "date-fns";
          // PERF: TanStack Query in its own vendor chunk so it's deduped
          // across all lazy route chunks.
          if (id.includes("@tanstack/")) return "tanstack";
          // PERF: wouter (router) in its own chunk — small but deduped.
          if (id.includes("/wouter/")) return "wouter";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {},
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
