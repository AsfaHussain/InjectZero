# ─── Build Stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# ─── Runtime Stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Add non-root user for least-privilege execution
RUN addgroup -S injectzero && adduser -S injectzero -G injectzero

WORKDIR /app

# Copy installed modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY api/      ./api/
COPY agent/    ./agent/
COPY package.json ./

# Set ownership to the non-root user
RUN chown -R injectzero:injectzero /app

USER injectzero

# Expose the default port (overridable via docker-compose env)
EXPOSE 3000

# Health check — Docker will mark the container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Start the gateway
CMD ["node", "api/server.js"]
