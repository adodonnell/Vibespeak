# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so layer is cached unless deps change
COPY package*.json ./

# Install ALL deps (devDeps needed for tsc)
RUN npm install --legacy-peer-deps

# Copy source and compile
COPY . .
RUN npm run build

# Remove devDeps — production image only needs runtime modules
RUN npm prune --omit=dev

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodejs -u 1001

WORKDIR /app

# Only copy what runtime needs
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist          ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json  ./package.json

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && chown nodejs:nodejs /app/logs

USER nodejs

# HTTP API, WebSocket signaling, Voice relay (UDP)
EXPOSE 3001 3002 9988/udp

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
