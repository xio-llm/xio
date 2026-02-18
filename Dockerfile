FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY server/ ./server/
COPY ui/ ./ui/

RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY ui/ ./ui/

RUN mkdir -p /app/storage

ENV NODE_ENV=production
ENV SERVER_PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/server/index.js"]
