FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (argon2, bcrypt)
RUN apk add --no-cache python3 make g++

# Install API dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Build admin dashboard
COPY client/admin-dashboard/package*.json ./client/admin-dashboard/
RUN cd client/admin-dashboard && npm ci
COPY client/admin-dashboard ./client/admin-dashboard
RUN cd client/admin-dashboard && npm run build

# Build client portal
COPY client/client-portal/package*.json ./client/client-portal/
RUN cd client/client-portal && npm ci
COPY client/client-portal ./client/client-portal
RUN cd client/client-portal && npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/admin-dashboard/dist ./public/admin
COPY --from=builder /app/client/client-portal/dist ./public/portal
COPY src/migrations ./src/migrations

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["node", "dist/index.js"]
