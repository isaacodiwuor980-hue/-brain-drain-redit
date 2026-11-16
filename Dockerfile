# ═══════════════════════════════════════════════════════════════════════════
# Brain Drain — Multi-stage production Dockerfile
# ═══════════════════════════════════════════════════════════════════════════
# Build:
#   docker build -t brain-drain:latest .
# Run:
#   docker run -p 3000:3000 --env-file .env brain-drain:latest
#
# Image size: ~180MB (node:22-alpine base + dist/ + node_modules)
# Runs as non-root user. No secrets baked into the image.

# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer). Copy only lockfile + package.json
# so this layer is reused unless deps change.
COPY package.json package-lock.json* bun.lock* ./
RUN npm ci --ignore-scripts

# Copy source and build.
COPY . .
RUN npm run build

# Prune dev dependencies — only production deps ship to the runner stage.
RUN npm prune --production

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install tini for proper PID 1 signal handling (graceful shutdown).
RUN apk add --no-cache tini

WORKDIR /app

# Create a non-root user for security.
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy built artifacts + production deps from builder.
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/supabase ./supabase

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# tini handles SIGTERM/SIGINT properly so Node's graceful shutdown fires.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.cjs"]

# Healthcheck — poll /api/healthz every 30s. 3 failures = unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/healthz || exit 1
