# Workflow Architect Docker Image
# Multi-stage build for production deployment with security hardening

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the application
RUN pnpm build

# Build UI
WORKDIR /app/ui
COPY ui/package.json ui/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY ui/ .
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Security: Install security updates
RUN apk upgrade --no-cache && \
    apk add --no-cache \
    tini \
    curl \
    wget

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Create non-root user with specific UID/GID
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    mkdir -p /app/logs /app/data && \
    chown -R nodejs:nodejs /app

# Copy built files with correct ownership
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/ui/dist ./ui/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile && \
    pnpm store prune

# Remove unnecessary files
RUN rm -rf /root/.npm /root/.cache /tmp/*

# Set environment variables
ENV NODE_ENV=production \
    PORT=3080 \
    NODE_OPTIONS="--max-old-space-size=2048" \
    # Security settings
    NODE_TLS_REJECT_UNAUTHORIZED=1

# Expose port
EXPOSE 3080

# Add labels for metadata
LABEL maintainer="workflow-architect" \
      version="0.1.0" \
      description="Workflow Architect - OSS Agentic Workflow Builder"

# Security: Drop all capabilities and add only required ones
# Security: Set read-only root filesystem (mount writable volumes as needed)
# Security: No new privileges
USER nodejs

# Health check with improved settings
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=15s \
            --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3080/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]
