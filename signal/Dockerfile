# =============================================================================
# StudioOS Production Dockerfile
# Multi-stage build for optimized production image
# =============================================================================

# Stage 1: Dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Install dependencies only (for layer caching)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Stage 2: Build (for assets if needed)
FROM node:22-alpine AS builder

WORKDIR /app

# Copy from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json ./

# Copy application source
COPY . .

# Build frontend (if present)
WORKDIR /app/web
RUN if [ -f package.json ]; then \
    npm ci && npm run build; \
  fi

WORKDIR /app

# Stage 3: Production runtime
FROM node:22-alpine AS runtime

# Add tini for proper process management
RUN apk add --no-cache tini

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 studioos

# Copy only what's needed for runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Copy application source (excluding dev files)
COPY --chown=studioos:nodejs config.js ./
COPY --chown=studioos:nodejs index.js ./
COPY --chown=studioos:nodejs validators.js ./
COPY --chown=studioos:nodejs routes ./routes
COPY --chown=studioos:nodejs middleware ./middleware
COPY --chown=studioos:nodejs services ./services
COPY --chown=studioos:nodejs docs ./docs

# Copy built frontend if exists
COPY --from=builder --chown=studioos:nodejs /app/web/dist ./web/dist

# Create storage directory with proper permissions
RUN mkdir -p /app/storage/assets && chown -R studioos:nodejs /app/storage

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_DIR=/app/storage/assets

# Expose port
EXPOSE 3000

# Switch to non-root user
USER studioos

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]