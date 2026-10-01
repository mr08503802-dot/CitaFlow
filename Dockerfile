# =====================================================================
# CitaFlow Micro-SaaS - Production Multi-Stage Dockerfile
# Optimized for Lean Size, Fast Builds, and High Security
# =====================================================================

FROM node:20-alpine AS base

# Install OpenSSL for Prisma and curl for container healthchecks
RUN apk add --no-cache openssl curl libc6-compat

WORKDIR /app

# Install dependencies based on package-lock.json
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application code and Prisma schemas
COPY . .

# Generate initial Prisma client
RUN npx prisma generate

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start container with automated database initialization & schema sync
CMD ["node", "scripts/docker-init.js"]
