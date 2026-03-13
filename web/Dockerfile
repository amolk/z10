# Multi-stage Docker build for z10 web app
# Based on Next.js with standalone output

FROM node:22-alpine AS base

# Install dependencies for both core library and web app
FROM base AS deps
WORKDIR /app

# Copy root package files (core library)
COPY package.json package-lock.json ./
RUN npm ci

# Copy web package files
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci

# Build the core library first
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules

# Copy source files
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/

# Build core library (web depends on it via file: link)
RUN npm run build

# Build Next.js app with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DOCKER_BUILD=1
RUN cd web && npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./web/.next/static
COPY --from=builder /app/web/public ./web/public

# Copy core library dist (needed at runtime via serverExternalPackages)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "web/server.js"]
